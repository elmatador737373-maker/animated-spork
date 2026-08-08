require('dotenv').config();
const express = require('express');
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

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Inizializzazione Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Rotta per UptimeRobot
app.get('/ping', (req, res) => {
    res.status(200).send('OK - Nova Shop is Alive');
});

// BOT DISCORD SETUP
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

// Gestione pulsanti interattivi
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const [action, orderId] = interaction.customId.split('_');
    
    // Recupera ordine da Supabase
    const { data: order, error: fetchErr } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

    if (fetchErr || !order) {
        return interaction.reply({ content: 'Ordine non trovato.', ephemeral: true });
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
                { name: 'Totale', value: `€${order.price.toFixed(2)}` }
            );

        await interaction.update({ embeds: [updatedEmbed] });
    } 
    else if (action === 'complete') {
        await supabase.from('orders').update({ status: 'Completato' }).eq('id', orderId);

        const completedChannel = await client.channels.fetch(process.env.CHANNEL_COMPLETED_ID).catch(() => null);
        if (completedChannel) {
            const completeEmbed = new EmbedBuilder()
                .setTitle(`🎉 Ordine Completato #${order.id}`)
                .setColor('#10b981')
                .addFields(
                    { name: 'Cliente', value: order.customer, inline: true },
                    { name: 'Prodotto', value: order.product_name, inline: true },
                    { name: 'Prezzo', value: `€${order.price.toFixed(2)}`, inline: true }
                )
                .setTimestamp();
            await completedChannel.send({ embeds: [completeEmbed] });
        }

        try {
            if (order.discord_user_id) {
                const user = await client.users.fetch(order.discord_user_id);
                const invoiceEmbed = new EmbedBuilder()
                    .setTitle(`📄 FATTURA D'ACQUISTO - NOVA SHOP`)
                    .setDescription(`Grazie per il tuo acquisto! Ecco la ricevuta del tuo ordine.`)
                    .setColor('#ff003c')
                    .addFields(
                        { name: 'ID Ordine', value: order.id, inline: true },
                        { name: 'Prodotto', value: order.product_name, inline: true },
                        { name: 'Importo Pagato', value: `€${order.price.toFixed(2)}`, inline: true },
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

// API PRODOTTI
app.get('/api/products', async (req, res) => {
    const { data, error } = await supabase.from('products').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/products/:id', async (req, res) => {
    const { data, error } = await supabase.from('products').select('*').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Prodotto non trovato' });
    res.json(data);
});

app.post('/api/products', async (req, res) => {
    const { name, variant, price, stock, description, image } = req.body;
    
    const newProduct = {
        name, 
        variant: variant || name, 
        price: parseFloat(price), 
        stock: parseInt(stock), 
        description, 
        image
    };
    
    const { data, error } = await supabase.from('products').insert([newProduct]).select().single();
    if (error) return res.status(500).json({ error: error.message });

    try {
        const stockChannel = await client.channels.fetch(process.env.CHANNEL_STOCK_ID);
        if (stockChannel) {
            const restockEmbed = new EmbedBuilder()
                .setColor('#22c55e')
                .setTitle(`${data.name} Restocked`)
                .setDescription(`Our product **${data.name}** has just been restocked!\n[Buy Now](http://localhost:3000/product.html?id=${data.id})`)
                .addFields(
                    { name: 'Variant', value: data.variant },
                    { name: 'Price', value: `€${data.price.toFixed(2).replace('.', ',')}` },
                    { name: 'Stock', value: `${data.stock}` }
                )
                .setImage(data.image)
                .setFooter({ text: 'Momentaneo Nova', iconURL: client.user.displayAvatarURL() });

            await stockChannel.send({ embeds: [restockEmbed] });
        }
    } catch (err) {
        console.error("Errore invio embed restock:", err);
    }

    res.json({ success: true, product: data });
});

// API ORDINI
app.post('/api/orders', async (req, res) => {
    const { productId, customer, discordUserId } = req.body;
    
    // Controlla prodotto e stock
    const { data: prod, error: prodErr } = await supabase.from('products').select('*').eq('id', productId).single();
    if (prodErr || !prod || prod.stock <= 0) {
        return res.status(400).json({ error: 'Prodotto esaurito o non valido.' });
    }

    const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const newOrder = {
        id: orderId,
        product_id: prod.id,
        product_name: prod.name,
        price: prod.price,
        customer: customer || 'Utente Guest',
        discord_user_id: discordUserId || null,
        status: 'In attesa di apertura ticket e pagamento'
    };

    const { error: orderErr } = await supabase.from('orders').insert([newOrder]);
    if (orderErr) return res.status(500).json({ error: orderErr.message });

    // Scala lo stock nel database
    await supabase.from('products').update({ stock: prod.stock - 1 }).eq('id', prod.id);

    try {
        const orderChannel = await client.channels.fetch(process.env.CHANNEL_ORDERS_ID);
        if (orderChannel) {
            const orderEmbed = new EmbedBuilder()
                .setTitle(`🛒 Nuovo Ordine #${newOrder.id}`)
                .setColor('#ff003c')
                .addFields(
                    { name: 'Stato', value: `🔴 ${newOrder.status}` },
                    { name: 'Cliente', value: newOrder.customer, inline: true },
                    { name: 'Prodotto', value: newOrder.product_name, inline: true },
                    { name: 'Totale', value: `€${newOrder.price.toFixed(2)}`, inline: true }
                )
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`paid_${newOrder.id}`)
                    .setLabel('Segna Come Pagato')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`complete_${newOrder.id}`)
                    .setLabel('Completato')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`cancel_${newOrder.id}`)
                    .setLabel('Annulla')
                    .setStyle(ButtonStyle.Danger)
            );

            await orderChannel.send({ embeds: [orderEmbed], components: [row] });
        }
    } catch (err) {
        console.error("Errore invio log ordine:", err);
    }

    res.json({ 
        success: true, 
        order: newOrder, 
        discordServerUrl: "https://discord.gg/7r46nnRBvY" 
    });
});

app.get('/api/orders', async (req, res) => {
    const { data, error } = await supabase.from('orders').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

const PORT = process.env.PORT || 3000;
client.login(process.env.DISCORD_BOT_TOKEN);
app.listen(PORT, () => console.log(`[SERVER] In ascolto sulla porta ${PORT} con Supabase`));
