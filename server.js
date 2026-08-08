const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Configurazione Sessioni
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

const DISCORD_SERVER_URL = "https://discord.gg/7r46nnRBvY";

// --- ROTTE OAUTH2 DISCORD ---
app.get('/auth/discord', (req, res) => {
    const discordLoginUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(discordLoginUrl);
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

// --- API PRODOTTI E ORDINI ---
app.get('/api/products', async (req, res) => {
    const { data, error } = await supabase.from('products').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/products/:id', async (req, res) => {
    const { data, error } = await supabase.from('products').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Prodotto non trovato' });
    res.json(data);
});

app.post('/api/products', async (req, res) => {
    const { name, variant, price, stock, image, description } = req.body;
    const { data, error } = await supabase.from('products').insert([{ name, variant, price, stock, image, description }]).select();
    
    if (error) return res.status(500).json({ error: error.message });

    // Invio eventuale webhook Discord di restock se configurato
    if (process.env.DISCORD_WEBHOOK_URL) {
        try {
            await fetch(process.env.DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    embeds: [{
                        title: "🚀 NUOVO RESTOCK / PRODOTTO!",
                        description: `**${name}**\nPrezzo: **€${price}**\nStock: **${stock}**`,
                        color: 16711680,
                        url: `${process.env.SITE_URL || 'http://localhost:3000'}/product.html?id=${data[0].id}`
                    }]
                })
            });
        } catch (webhookErr) {
            console.error('Errore invio webhook Discord:', webhookErr);
        }
    }

    res.json({ success: true, product: data[0] });
});

app.post('/api/orders', async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Devi effettuare il login con Discord per ordinare.' });
    }

    const { productId } = req.body;
    const customer = `${req.session.user.global_name} (${req.session.user.username} - ID: ${req.session.user.id})`;

    const { data: product, error: prodError } = await supabase.from('products').select('*').eq('id', productId).single();
    if (prodError || !product) return res.status(404).json({ error: 'Prodotto non trovato.' });

    if (product.stock <= 0) return res.status(400).json({ error: 'Prodotto esaurito.' });

    const { data: orderData, error: orderError } = await supabase.from('orders').insert([{
        product_id: product.id,
        product_name: product.name,
        customer: customer,
        price: product.price,
        status: 'In attesa di pagamento'
    }]).select();

    if (orderError) return res.status(500).json({ error: orderError.message });

    await supabase.from('products').update({ stock: product.stock - 1 }).eq('id', productId);

    res.json({ 
        success: true, 
        order: orderData[0], 
        discordServerUrl: DISCORD_SERVER_URL 
    });
});

app.get('/api/orders', async (req, res) => {
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server avviato sulla porta ${PORT}`));
