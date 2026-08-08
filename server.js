require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
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

// Rotta invisibile per UptimeRobot (impedisce lo sleep su Render)
app.get('/ping', (req, res) => {
    res.status(200).send('OK - Nova Shop is Alive');
});

let products = [
    {
        id: "1",
        name: "Server Boost 1M",
        variant: "Server Boost 1M",
        price: 2.50,
        stock: 3,
        description: "Potenzia il tuo server Discord per 1 Mese al miglior prezzo sul mercato.",
        image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=500&auto=format&fit=crop"
    }
];

let orders = [];

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

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const [action, orderId] = interaction.customId.split('_');
    const order = orders.find(o => o.id === orderId);

    if (!order) {
        return interaction.reply({ content: 'Ordine non trovato.', ephemeral: true });
    }

    if (action === 'cancel') {
        order.status = 'Annullato';
        await interaction.update({ 
            content: `❌ **ORDINE ANNULLATO** da ${interaction.user.tag}`, 
            components: [] 
        });
    } 
    else if (action === 'paid') {
        order.status = 'Pagamento Verificato';
        
        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('#3b82f6')
            .setFields(
                { name: 'Stato', value: '🟡 Pagamento Verificato (In Lavorazione)' },
                { name: 'Cliente', value: order.customer },
                { name: 'Prodotto', value: order.productName },
                { name: 'Totale', value: `€${order.price.toFixed(2)}` }
            );

        await interaction.update({ embeds: [updatedEmbed] });
    } 
    else if (action === 'complete') {
        order.status = 'Completato';

        const completedChannel = await client.channels.fetch(process.env.CHANNEL_COMPLETED_ID).catch(() => null);
        if (completedChannel) {
            const completeEmbed = new EmbedBuilder()
                .setTitle(`🎉 Ordine Completato #${order.id}`)
                .setColor('#10b981')
                .addFields(
                    { name: 'Cliente', value: order.customer, inline: true },
                    { name: 'Prodotto', value: order.productName, inline: true },
                    { name: 'Prezzo', value: `€${order.price.toFixed(2)}`, inline: true }
                )
                .setTimestamp();
            await completedChannel.send({ embeds: [completeEmbed] });
        }

        try {
            if (order.discordUserId) {
                const user = await client.users.fetch(order.discordUserId);
                const invoiceEmbed = new EmbedBuilder()
                    .setTitle(`📄 FATTURA D'ACQUISTO - NOVA SHOP`)
                    .setDescription(`Grazie per il tuo acquisto! Ecco la ricevuta del tuo ordine.`)
                    .setColor('#ff003c')
                    .addFields(
                        { name: 'ID Ordine', value: order.id, inline: true },
                        { name: 'Prodotto', value: order.productName, inline: true },
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

app.get('/api/products', (req, res) => res.json(products));

app.get('/api/products/:id', (req, res) => {
    const prod = products.find(p => p.id === req.params.id);
    if (!prod) return res.status(404).json({ error: 'Prodotto non trovato' });
    res.json(prod);
});

app.post('/api/products', async (req, res) => {
    const { name, variant, price, stock, description, image } = req.body;
    
    const newProduct = {
        id: Date.now().toString(),
        name, variant: variant || name, price: parseFloat(price), stock: parseInt(stock), description, image
    };
    
    products.push(newProduct);

    try {
        const stockChannel = await client.channels.fetch(process.env.CHANNEL_STOCK_ID);
        if (stockChannel) {
            const restockEmbed = new EmbedBuilder()
                .setColor('#22c55e')
                .setTitle(`${newProduct.name} Restocked`)
                .setDescription(`Our product **${newProduct.name}** has just been restocked!\n[Buy Now](http://localhost:3000/product.html?id=${newProduct.id})`)
                .addFields(
                    { name: 'Variant', value: newProduct.variant },
                    { name: 'Price', value: `€${newProduct.price.toFixed(2).replace('.', ',')}` },
                    { name: 'Stock', value: `${newProduct.stock}` }
                )
                .setImage(newProduct.image)
                .setFooter({ text: 'Momentaneo Nova', iconURL: client.user.displayAvatarURL() });

            await stockChannel.send({ embeds: [restockEmbed] });
        }
    } catch (err) {
        console.error("Errore invio embed restock:", err);
    }

    res.json({ success: true, product: newProduct });
});

app.post('/api/orders', async (req, res) => {
    const { productId, customer, discordUserId } = req.body;
    const prod = products.find(p => p.id === productId);

    if (!prod || prod.stock <= 0) {
        return res.status(400).json({ error: 'Prodotto esaurito o non valido.' });
    }

    const order = {
        id: 'ORD-' + Math.floor(100000 + Math.random() * 900000),
        productId: prod.id,
        productName: prod.name,
        price: prod.price,
        customer: customer || 'Utente Guest',
        discordUserId: discordUserId || null,
        status: 'In attesa di apertura ticket e pagamento',
        date: new Date().toLocaleString('it-IT')
    };

    orders.push(order);

    try {
        const orderChannel = await client.channels.fetch(process.env.CHANNEL_ORDERS_ID);
        if (orderChannel) {
            const orderEmbed = new EmbedBuilder()
                .setTitle(`🛒 Nuovo Ordine #${order.id}`)
                .setColor('#ff003c')
                .addFields(
                    { name: 'Stato', value: `🔴 ${order.status}` },
                    { name: 'Cliente', value: order.customer, inline: true },
                    { name: 'Prodotto', value: order.productName, inline: true },
                    { name: 'Totale', value: `€${order.price.toFixed(2)}`, inline: true }
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
    } catch (err) {
        console.error("Errore invio log ordine:", err);
    }

    res.json({ 
        success: true, 
        order, 
        discordServerUrl: "https://discord.gg/7r46nnRBvY" 
    });
});

app.get('/api/orders', (req, res) => res.json(orders));

const PORT = process.env.PORT || 3000;
client.login(process.env.DISCORD_BOT_TOKEN);
app.listen(PORT, () => console.log(`[SERVER] In ascolto sulla porta ${PORT}`));
