const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- HEALTH CHECK PER UPTIMEROBOT ---
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'online', timestamp: new Date() });
});

// Configurazione Sessioni per OAuth2
app.use(session({
    secret: process.env.SESSION_SECRET || 'super_secret_key_nova_shop',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Imposta true se usi HTTPS in produzione
}));

// Configurazione Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- MIDDLEWARE CONTROLLO ADMIN ---
const checkAdmin = (req, res, next) => {
    // Verifica se l'utente è loggato tramite Discord OAuth2
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Devi effettuare il login con Discord.' });
    }

    const userId = req.session.user.id;
    const adminIds = process.env.ADMIN_DISCORD_IDS ? process.env.ADMIN_DISCORD_IDS.split(',') : [];

    // Controlla se l'ID dell'utente loggato è tra quelli degli owner
    if (!adminIds.includes(userId)) {
        return res.status(403).json({ error: 'Accesso negato: questa azione è riservata agli Owner.' });
    }

    next(); // L'utente è un owner, procedi con la richiesta
};

const DISCORD_SERVER_URL = "https://discord.gg/7r46nnRBvY";

// --- BOT DISCORD SETUP ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ] 
});

client.once('ready', () => {
    console.log(`[BOT] Loggato come ${client.user.tag}`);
});

// GESTIONE PULSANTI INTERATTIVI NEL CANALE LOG ORDINI
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const [action, orderId] = interaction.customId.split('_');
    
    // Recupera l'ordine da Supabase
    const { data: order, error: fetchError } = await supabase.from('orders').select('*').eq('id', orderId).single();

    if (fetchError || !order) {
        return interaction.reply({ content: 'Ordine non trovato nel database.', ephemeral: true });
    }

    if (action === 'cancel') {
        await supabase.from('orders').update({ status: 'Annullato' }).eq('id', orderId);
        await interaction.update({ 
            content: `❌ **ORDINE ANNULLATO** da ${interaction.user.tag}`, 
            components: [] 
        });
    } 
    else if (action === 'paid') {
        await supabase.from('orders').update({ status: 'Pagamento Verificato' }).eq('id', orderId);
        
        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('#3b82f6')
            .setFields(
                { name: 'Stato', value: '🟡 Pagamento Verificato (In Lavorazione)' },
                { name: 'Cliente', value: order.customer },
                { name: 'Prodotto', value: order.product_name },
                { name: 'Totale', value: `€${Number(order.price).toFixed(2)}` }
            );

        await interaction.update({ embeds: [updatedEmbed] });
    } 
    else if (action === 'complete') {
        await supabase.from('orders').update({ status: 'Completato' }).eq('id', orderId);

        // 1. Notifica su canale ordini completati
        if (process.env.CHANNEL_COMPLETED_ID) {
            const completedChannel = await client.channels.fetch(process.env.CHANNEL_COMPLETED_ID).catch(() => null);
            if (completedChannel) {
                const completeEmbed = new EmbedBuilder()
                    .setTitle(`🎉 Ordine Completato #${order.id}`)
                    .setColor('#10b981')
                    .addFields(
                        { name: 'Cliente', value: order.customer, inline: true },
                        { name: 'Prodotto', value: order.product_name, inline: true },
                        { name: 'Prezzo', value: `€${Number(order.price).toFixed(2)}`, inline: true }
                    )
                    .setTimestamp();
                await completedChannel.send({ embeds: [completeEmbed] });
            }
        }

        // 2. Invio Fattura in DM al cliente (se è stato salvato l'ID Discord nell'oggetto customer o sessione)
        try {
            // Estrae l'ID Discord dalla stringa del cliente se formattata come "GlobalName (username - ID: 123456)"
            const idMatch = order.customer.match(/ID: (\d+)/);
            if (idMatch && idMatch[1]) {
                const discordUserId = idMatch[1];
                const user = await client.users.fetch(discordUserId);
                const invoiceEmbed = new EmbedBuilder()
                    .setTitle(`📄 FATTURA D'ACQUISTO - NOVA SHOP`)
                    .setDescription(`Grazie per il tuo acquisto! Ecco la ricevuta del tuo ordine.`)
                    .setColor('#ff003c')
                    .addFields(
                        { name: 'ID Ordine', value: order.id.toString(), inline: true },
                        { name: 'Prodotto', value: order.product_name, inline: true },
                        { name: 'Importo Pagato', value: `€${Number(order.price).toFixed(2)}`, inline: true },
                        { name: 'Stato', value: 'COMPLETATO & CONSEGNATO' }
                    )
                    .setFooter({ text: 'NOVA SHOP - https://discord.gg/7r46nnRBvY' })
                    .setTimestamp();

                await user.send({ embeds: [invoiceEmbed] });
            }
        } catch (err) {
            console.log("Impossibile inviare il DM all'utente:", err.message);
        }

        await interaction.update({ 
            content: `✅ **ORDINE COMPLETATO** gestito da ${interaction.user.tag}`, 
            components: [] 
        });
    }
});


app.get('/auth/discord', (req, res) => {
    const discordOAuthUrl = `https://discord.com/oauth2/authorize?client_id=1475507053249433620&response_type=code&redirect_uri=https%3A%2F%2Fnova-shop-pehc.onrender.com%2Fauth%2Fdiscord%2Fcallback&scope=identify+guilds`;
    res.redirect(discordOAuthUrl);
});

app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('Codice di autorizzazione mancante.');

    try {
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.DISCORD_REDIRECT_URI,
            })
        });

        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) return res.status(400).send('Autenticazione Discord fallita.');

        const userRes = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const userData = await userRes.json();

        req.session.user = {
            id: userData.id,
            username: userData.username,
            global_name: userData.global_name || userData.username,
            avatar: userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'
        };

        res.redirect('/index.html');
    } catch (err) {
        console.error('Errore OAuth Discord:', err);
        res.status(500).send('Errore interno del server durante il login.');
    }
});

app.get('/api/auth/me', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/index.html');
    });
});


// --- API REST PER FRONTEND (SUPABASE) ---

// 1. Get tutti i prodotti
app.get('/api/products', async (req, res) => {
    const { data, error } = await supabase.from('products').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// 2. Get singolo prodotto
app.get('/api/products/:id', async (req, res) => {
    const { data, error } = await supabase.from('products').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Prodotto non trovato' });
    res.json(data);
});

// 3. Aggiungi / Restock Prodotto + Invio Embed su Discord
app.post('/api/products', async (req, res) => {
    const { name, variant, price, stock, description, image } = req.body;
    
    const { data, error } = await supabase.from('products').insert([{
        name, 
        variant: variant || name, 
        price: parseFloat(price), 
        stock: parseInt(stock), 
        description, 
        image
    }]).select();

    if (error) return res.status(500).json({ error: error.message });
    const newProduct = data[0];

    // Invio Embed su Discord (canale stock-products)
    try {
        if (process.env.CHANNEL_STOCK_ID) {
            const stockChannel = await client.channels.fetch(process.env.CHANNEL_STOCK_ID);
            if (stockChannel) {
                const restockEmbed = new EmbedBuilder()
                    .setColor('#22c55e')
                    .setTitle(`${newProduct.name} Restocked`)
                    .setDescription(`Our product **${newProduct.name}** has just been restocked!\n[Buy Now](http://localhost:3000/product.html?id=${newProduct.id})`)
                    .addFields(
                        { name: 'Variant', value: newProduct.variant },
                        { name: 'Price', value: `€${Number(newProduct.price).toFixed(2).replace('.', ',')}` },
                        { name: 'Stock', value: `${newProduct.stock}` }
                    )
                    .setImage(newProduct.image)
                    .setFooter({ text: 'Momentaneo Nova', iconURL: client.user.displayAvatarURL() });

                await stockChannel.send({ embeds: [restockEmbed] });
            }
        }
    } catch (err) {
        console.error("Errore invio embed restock:", err);
    }

    res.json({ success: true, product: newProduct });
});

// 4. Creazione Ordine (Richiede login Discord)
app.post('/api/orders', async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Devi effettuare il login con Discord per ordinare.' });
    }

    const { productId } = req.body;
    const customer = `${req.session.user.global_name} (${req.session.user.username} - ID: ${req.session.user.id})`;

    const { data: product, error: prodError } = await supabase.from('products').select('*').eq('id', productId).single();
    if (prodError || !product) return res.status(404).json({ error: 'Prodotto non trovato.' });

    if (product.stock <= 0) return res.status(400).json({ error: 'Prodotto esaurito.' });

    // Inserimento ordine su Supabase
    const { data: orderData, error: orderError } = await supabase.from('orders').insert([{
        product_id: product.id,
        product_name: product.name,
        customer: customer,
        price: product.price,
        status: 'In attesa di apertura ticket e pagamento'
    }]).select();

    if (orderError) return res.status(500).json({ error: orderError.message });
    const order = orderData[0];

    // Scala lo stock del prodotto
    await supabase.from('products').update({ stock: product.stock - 1 }).eq('id', productId);

    // Invio Notifica nel Canale Log Ordini con Pulsanti Persistenti
    try {
        if (process.env.CHANNEL_ORDERS_ID) {
            const orderChannel = await client.channels.fetch(process.env.CHANNEL_ORDERS_ID);
            if (orderChannel) {
                const orderEmbed = new EmbedBuilder()
                    .setTitle(`🛒 Nuovo Ordine #${order.id}`)
                    .setColor('#ff003c')
                    .addFields(
                        { name: 'Stato', value: `🔴 ${order.status}` },
                        { name: 'Cliente', value: order.customer, inline: true },
                        { name: 'Prodotto', value: order.product_name, inline: true },
                        { name: 'Totale', value: `€${Number(order.price).toFixed(2)}`, inline: true }
                    )
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`paid_${order.id}`)
                        .setLabel('Segna Come Pagato')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`complete_${order.id}`)
                        .setLabel('Completato')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`cancel_${order.id}`)
                        .setLabel('Annulla')
                        .setStyle(ButtonStyle.Danger)
                );

                await orderChannel.send({ embeds: [orderEmbed], components: [row] });
            }
        }
    } catch (err) {
        console.error("Errore invio log ordine:", err);
    }

    res.json({ 
        success: true, 
        order, 
        discordServerUrl: DISCORD_SERVER_URL 
    });
});

// 5. Get Ordini
app.get('/api/orders', async (req, res) => {
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Avvio bot e server
client.login(process.env.DISCORD_BOT_TOKEN);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[SERVER] In ascolto su http://localhost:${PORT}`));
