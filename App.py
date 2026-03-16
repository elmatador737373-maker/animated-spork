import os
import asyncio
import threading
import discord
from discord.ext import commands
from flask import Flask, render_template, request, jsonify, session

# --- CONFIGURAZIONE ---
TOKEN = os.getenv("BOT_TOKEN")
GUILD_ID = int(os.getenv("GUILD_ID") or 0)
STAFF_ROLES = ["Founder", "Admin", "Staff"] # Nomi dei ruoli su Discord

# --- INIZIALIZZAZIONE ---
app = Flask(__name__)
app.secret_key = "platinum_return_exclusive_key"

intents = discord.Intents.default()
intents.members = True 
intents.presences = True
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

# --- LOGICA DEL BOT ---
@bot.event
async def on_ready():
    print(f"✅ Bot Platinum Return loggato come {bot.user}")

# --- ROTTE FLASK (SITO WEB) ---

@app.route('/')
def home():
    guild = bot.get_guild(GUILD_ID)
    stats = {
        "members": guild.member_count if guild else "0",
        "status": "ONLINE" if guild else "OFFLINE"
    }
    # HTML Integrato direttamente per comodità in un unico file
    return render_template_string(BASE_HTML, page="home", stats=stats)

@app.get('/staff')
def staff():
    guild = bot.get_guild(GUILD_ID)
    staff_list = []
    if guild:
        for member in guild.members:
            # Trova il ruolo più alto tra quelli definiti in STAFF_ROLES
            relevant_roles = [r for r in member.roles if r.name in STAFF_ROLES]
            if relevant_roles:
                highest_role = max(relevant_roles, key=lambda x: x.position)
                staff_list.append({
                    "name": member.display_name,
                    "role": highest_role.name,
                    "color": str(highest_role.color),
                    "avatar": member.display_avatar.url
                })
    return render_template_string(BASE_HTML, page="staff", staff=staff_list)

@app.route('/shop')
def shop():
    packages = [
        {"name": "VIP PLATINUM", "price": "15.00€", "desc": "Accesso prioritario + Auto Custom"},
        {"name": "GANG STARTER", "price": "25.00€", "desc": "Base Gang + 5 Armi"},
        {"name": "AUTO IMPORT", "price": "10.00€", "desc": "Scegli un'auto dal catalogo"}
    ]
    return render_template_string(BASE_HTML, page="shop", packages=packages)

@app.route('/api/ticket', methods=['POST'])
def ticket_api():
    data = request.json
    guild = bot.get_guild(GUILD_ID)
    channel = discord.utils.get(guild.text_channels, name="ticket-staff")
    
    if channel:
        embed = discord.Embed(title="🎫 NUOVO TICKET DAL SITO", color=0xeeeeee)
        embed.add_field(name="Utente", value=data.get('name'), inline=True)
        embed.add_field(name="Oggetto", value=data.get('subject'), inline=True)
        embed.add_field(name="Messaggio", value=data.get('message'), inline=False)
        
        # Eseguiamo la coroutine del bot nel thread principale del loop
        bot.loop.create_task(channel.send(embed=embed))
        return jsonify({"status": "success"})
    return jsonify({"status": "error", "message": "Canale non trovato"}), 500

# --- TEMPLATE HTML (Tutto in uno) ---
from flask import render_template_string

BASE_HTML = """
<!DOCTYPE html>
<html lang="it">
<head>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;900&display=swap');
        body { font-family: 'Inter', sans-serif; background-color: #050505; color: white; }
        .platinum-gradient { background: linear-gradient(135deg, #ffffff 0%, #444444 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    </style>
</head>
<body>
    <nav class="p-6 flex justify-between items-center border-b border-white/5">
        <div class="text-2xl font-black italic tracking-tighter">PLATINUM <span class="text-gray-500">RETURN</span></div>
        <div class="space-x-8 uppercase text-xs font-bold tracking-widest">
            <a href="/" class="hover:text-gray-400">Home</a>
            <a href="/staff" class="hover:text-gray-400">Staff</a>
            <a href="/shop" class="text-yellow-500 hover:text-yellow-400">Shop</a>
        </div>
    </nav>

    {% if page == "home" %}
    <header class="py-20 text-center">
        <h1 class="text-8xl font-black italic platinum-gradient mb-4">PLATINUM RP</h1>
        <p class="text-gray-400 text-lg mb-8">Benvenuti nel ritorno della leggenda.</p>
        <div class="flex justify-center gap-4">
            <div class="bg-[#111] p-6 rounded-2xl border border-white/5 w-40">
                <div class="text-3xl font-bold">{{ stats.members }}</div>
                <div class="text-[10px] text-gray-500 uppercase">Cittadini</div>
            </div>
            <div class="bg-[#111] p-6 rounded-2xl border border-white/5 w-40">
                <div class="text-3xl font-bold text-green-500 italic">ON</div>
                <div class="text-[10px] text-gray-500 uppercase">Status Server</div>
            </div>
        </div>
    </header>
    
    <section class="max-w-xl mx-auto p-10 bg-[#0a0a0a] border border-white/5 rounded-3xl">
        <h2 class="text-2xl font-black mb-6 italic uppercase">Supporto Rapido</h2>
        <input id="name" type="text" placeholder="Tuo Nome" class="w-full bg-black border border-white/10 p-4 rounded-xl mb-4">
        <input id="sub" type="text" placeholder="Oggetto" class="w-full bg-black border border-white/10 p-4 rounded-xl mb-4">
        <textarea id="msg" placeholder="Messaggio..." class="w-full bg-black border border-white/10 p-4 rounded-xl mb-4 h-32"></textarea>
        <button onclick="sendTicket()" class="w-full bg-white text-black font-black py-4 rounded-xl uppercase italic">Apri Ticket</button>
    </section>

    {% elif page == "staff" %}
    <div class="max-w-5xl mx-auto py-20 px-4">
        <h1 class="text-4xl font-black mb-12 italic uppercase">Team Amministrativo</h1>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            {% for s in staff %}
            <div class="bg-[#111] p-6 rounded-2xl border-l-4" style="border-color: {{s.color}}">
                <img src="{{s.avatar}}" class="w-16 h-16 rounded-full mb-4 border border-white/10">
                <div class="text-xl font-bold">{{s.name}}</div>
                <div class="text-xs uppercase font-black opacity-50">{{s.role}}</div>
            </div>
            {% endfor %}
        </div>
    </div>

    {% elif page == "shop" %}
    <div class="max-w-5xl mx-auto py-20 px-4">
        <h1 class="text-4xl font-black mb-12 italic uppercase">Platinum Store</h1>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            {% for p in packages %}
            <div class="bg-[#111] p-8 rounded-3xl border border-white/5 flex flex-col justify-between">
                <div>
                    <div class="text-2xl font-bold mb-2">{{p.name}}</div>
                    <div class="text-gray-500 text-sm mb-6">{{p.desc}}</div>
                </div>
                <div>
                    <div class="text-3xl font-black mb-4">{{p.price}}</div>
                    <button class="w-full bg-blue-600 py-3 rounded-xl font-bold">Acquista Ora</button>
                </div>
            </div>
            {% endfor %}
        </div>
    </div>
    {% endif %}

    <script>
    async function sendTicket() {
        const data = {
            name: document.getElementById('name').value,
            subject: document.getElementById('sub').value,
            message: document.getElementById('msg').value
        };
        const res = await fetch('/api/ticket', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        if(res.ok) alert("Ticket inviato allo Staff!");
    }
    </script>
</body>
</html>
"""

# --- AVVIO ---
def run_flask():
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

if __name__ == "__main__":
    t = threading.Thread(target=run_flask)
    t.start()
    bot.run(TOKEN)
