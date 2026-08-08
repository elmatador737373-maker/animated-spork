require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { createClient } = require('@supabase/supabase-js');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const ADMIN_IDS = process.env.ADMIN_DISCORD_IDS ? process.env.ADMIN_DISCORD_IDS.split(',').map(id => id.trim()) : [];

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_REDIRECT_URI,
    scope: ['identify']
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'nova-secret',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// OAuth Discord
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

// API Utente Corrente
app.get('/api/me', (req, res) => {
    if (!req.isAuthenticated()) return res.json({ user: null, isAdmin: false });
    const isAdmin = ADMIN_IDS.includes(req.user.id);
    res.json({ user: req.user, isAdmin });
});

// API Prodotti
app.get('/api/products', async (req, res) => {
    const { data, error } = await supabase.from('products').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// API Ordini Utente
app.get('/api/orders', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Non autorizzato' });
    const { data, error } = await supabase.from('orders').select('*').eq('customer', req.user.username);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Checkout e Notifica Discord Ordini
app.post('/api/checkout', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Devi effettuare il login con Discord!' });
    const { productId, productName, price } = req.body;
    const customerName = req.user.username;

    const { data: prodData } = await supabase.from('products').select('stock').eq('id', productId).single();
    if (!prodData || prodData.stock <= 0) {
        return res.status(400).json({ error: 'Prodotto esaurito!' });
    }

    await supabase.from('products').update({ stock: prodData.stock - 1 }).eq('id', productId);

    const { data, error } = await supabase.from('orders').insert([
        { product_id: productId, product_name: productName, customer: customerName, price: price, status: 'In attesa di apertura ticket e pagamento' }
    ]).select();

    if (error) return res.status(500).json({ error: error.message });

    try {
        const orderChannel = await client.channels.fetch(process.env.CHANNEL_ORDERS_ID);
        if (orderChannel) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`approve_${data[0].id}`).setLabel('Approva Pagamento').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`complete_${data[0].id}`).setLabel('Completa Ordine').setStyle(ButtonStyle.Primary)
            );

            await orderChannel.send({
                content: `🛒 **Nuovo Ordine #${data[0].id}**\n👤 **Cliente:** ${customerName}\n📦 **Prodotto:** ${productName}\n💰 **Prezzo:** €${price}\n⚠️ *In attesa di ticket e pagamento.*`,
                components: [row]
            });
        }
    } catch (err) {
        console.error("Errore invio Discord:", err);
    }

    res.json({ success: true, message: 'Ordine creato!' });
});

// Admin: Aggiungi Prodotto & Restock Discord
app.post('/api/admin/product', async (req, res) => {
    if (!req.isAuthenticated() || !ADMIN_IDS.includes(req.user.id)) {
        return res.status(403).json({ error: 'Accesso negato.' });
    }

    const { name, variant, price, stock, description, image } = req.body;
    const { data, error } = await supabase.from('products').insert([
        { name, variant, price, stock, description, image }
    ]).select();

    if (error) return res.status(500).json({ error: error.message });

    try {
        const stockChannel = await client.channels.fetch(process.env.CHANNEL_STOCK_ID);
        if (stockChannel) {
            stockChannel.send(`🔥 **NUOVO PRODOTTO / RESTOCK SU NOVA SHOP!** 🔥\n\n📦 **${name}** ${variant ? '('+variant+')' : ''}\n💰 Prezzo: **€${price}**\n🔢 Stock: **${stock}** pezzi\n🔗 Corri sul sito a comprarlo!`);
        }
    } catch (err) {
        console.error("Errore invio canale stock:", err);
    }

    res.json({ success: true, product: data[0] });
});

// Rotte Pagine HTML Separate (dalla cartella public)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/products.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'products.html')));
app.get('/cart.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cart.html')));
app.get('/admin.html', async (req, res) => {
    if (!req.isAuthenticated() || !ADMIN_IDS.includes(req.user.id)) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Gestione Bottoni Discord (Admin)
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (!ADMIN_IDS.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ Non sei autorizzato.', ephemeral: true });
    }

    const [action, orderId] = interaction.customId.split('_');

    if (action === 'approve') {
        await supabase.from('orders').update({ status: 'Pagamento Approvato - In lavorazione' }).eq('id', orderId);
        await interaction.reply({ content: `✅ Pagamento dell'ordine #${orderId} approvato!`, ephemeral: true });
    } 
    else if (action === 'complete') {
        await supabase.from('orders').update({ status: 'Completato' }).eq('id', orderId);

        try {
            const completedChannel = await client.channels.fetch(process.env.CHANNEL_COMPLETED_ID);
            if (completedChannel) {
                const embed = new EmbedBuilder()
                    .setTitle(`✅ Ordine #${orderId} Completato`)
                    .setDescription(`L'ordine è stato completato con successo da ${interaction.user.tag}.`)
                    .setColor(0x00FF00)
                    .setTimestamp();
                await completedChannel.send({ embeds: [embed] });
            }
        } catch (err) {
            console.error("Errore canale completati:", err);
        }

        await interaction.update({ content: `${interaction.message.content}\n\n🎉 **STATO: COMPLETATO DA ${interaction.user.tag}**`, components: [] });
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
app.listen(PORT, () => console.log(`Nova Shop avviato sulla porta ${PORT}`));
