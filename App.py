import os
import json
import threading
import discord
from flask import Flask, render_template_string, request, jsonify, session, redirect, url_for
from discord.ext import commands
from zenora import APIClient

# --- CONFIGURAZIONE ---
TOKEN = os.getenv("BOT_TOKEN")
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
REDIRECT_URI = os.getenv("CALLBACK_URL") 
GUILD_ID = int(os.getenv("GUILD_ID") or 0)
ADMIN_IDS = ["IL_TUO_ID_DISCORD"] # Inserisci qui il tuo ID

app = Flask(__name__)
app.secret_key = "platinum_return_secret_key_99"

# Bot Discord
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

# Client per Login Discord (OAuth2)
api_client = APIClient(TOKEN, client_secret=CLIENT_SECRET)

# --- DATABASE LOCALE (JSON) ---
DB_FILE = 'staff_db.json'
if not os.path.exists(DB_FILE):
    with open(DB_FILE, 'w') as f: json.dump([], f)

def get_staff():
    with open(DB_FILE, 'r') as f: return json.load(f)

def save_staff(data):
    with open(DB_FILE, 'w') as f: json.dump(data, f)

# --- LOGICA DASHBOARD & AUTH ---

@app.route('/login')
def login():
    url = f"https://discord.com/api/oauth2/authorize?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&response_type=code&scope=identify"
    return redirect(url)

@app.route('/callback')
def callback():
    code = request.args.get('code')
    access_token = api_client.oauth.get_access_token(code, REDIRECT_URI).access_token
    session['token'] = access_token
    return redirect(url_for('dashboard'))

@app.route('/dashboard')
def dashboard():
    if 'token' not in session: return redirect(url_for('login'))
    bearer_client = APIClient(session['token'], bearer=True)
    user = bearer_client.users.get_current_user()
    
    if str(user.id) not in ADMIN_IDS:
        return "⚠️ Accesso Negato: Non sei autorizzato.", 403
    
    return render_template_string(BASE_HTML, page="dashboard", staff=get_staff(), user=user)

# --- API ADMIN ---

@app.route('/api/admin/add', methods=['POST'])
def add_member():
    if 'token' not in session: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    staff = get_staff()
    staff.append(data)
    save_staff(staff)
    return jsonify({"status": "success"})

@app.route('/api/admin/delete/<int:idx>', methods=['DELETE'])
def delete_member(idx):
    staff = get_staff()
    if 0 <= idx < len(staff):
        staff.pop(idx)
        save_staff(staff)
    return jsonify({"status": "success"})

# --- ROTTE PUBBLICHE ---

@app.route('/')
def index():
    return render_template_string(BASE_HTML, page="home")

@app.route('/staff')
def staff_page():
    return render_template_string(BASE_HTML, page="staff", staff=get_staff())

@app.route('/shop')
def shop_page():
    packages = [
        {"name": "VIP PLATINUM", "price": "15€", "desc": "Priorità e Auto Esclusiva"},
        {"name": "GANG STARTER", "price": "25€", "desc": "Base + Armi per la tua crew"},
        {"name": "UNBAN", "price": "50€", "desc": "Seconda chance (previa revisione)"}
    ]
    return render_template_string(BASE_HTML, page="shop", packages=packages)

@app.route('/api/ticket', methods=['POST'])
def ticket():
    data = request.json
    guild = bot.get_guild(GUILD_ID)
    channel = discord.utils.get(guild.text_channels, name="ticket-staff")
    if channel:
        embed = discord.Embed(title="🎫 NUOVO TICKET DAL SITO", color=0xffffff)
        embed.add_field(name="Utente", value=data['name'])
        embed.add_field(name="Oggetto", value=data['subject'])
        embed.add_field(name="Messaggio", value=data['message'], inline=False)
        bot.loop.create_task(channel.send(embed=embed))
        return jsonify({"status": "success"})
    return jsonify({"status": "error"}), 500

# --- TEMPLATE HTML (Unificato) ---
BASE_HTML = """
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #050505; color: white; font-family: 'Inter', sans-serif; }
        .platinum-text { background: linear-gradient(to right, #fff, #666); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    </style>
</head>
<body>
    <nav class="p-6 border-b border-white/5 flex justify-between items-center max-w-7xl mx-auto">
        <div class="font-black italic text-2xl tracking-tighter">PLATINUM <span class="text-gray-600 font-normal">RETURN</span></div>
        <div class="space-x-6 uppercase text-[10px] font-bold tracking-widest">
            <a href="/" class="hover:text-gray-400">Home</a>
            <a href="/staff" class="hover:text-gray-400">Staff</a>
            <a href="/shop" class="text-yellow-500 hover:text-yellow-400">Shop</a>
            <a href="/dashboard" class="bg-white text-black px-3 py-1 rounded">Admin</a>
        </div>
    </nav>

    {% if page == "home" %}
    <div class="text-center py-20 px-4">
        <h1 class="text-7xl font-black italic platinum-text mb-6">RETURN TO STREETS</h1>
        <p class="text-gray-500 max-w-lg mx-auto mb-10">Il server RP definitivo. Qualità, serietà e puro divertimento.</p>
        
        <div class="max-w-md mx-auto bg-[#111] p-8 rounded-3xl border border-white/5">
            <h3 class="text-xl font-bold mb-6 italic uppercase">Supporto Web</h3>
            <input id="t-name" type="text" placeholder="Tuo Nome" class="w-full bg-black border border-white/10 p-3 rounded-lg mb-3">
            <input id="t-sub" type="text" placeholder="Oggetto" class="w-full bg-black border border-white/10 p-3 rounded-lg mb-3">
            <textarea id="t-msg" placeholder="Descrizione..." class="w-full bg-black border border-white/10 p-3 rounded-lg mb-3 h-24"></textarea>
            <button onclick="sendTicket()" class="w-full bg-white text-black font-black py-3 rounded-lg hover:bg-gray-200">INVIA TICKET</button>
        </div>
    </div>

    {% elif page == "staff" %}
    <div class="max-w-6xl mx-auto py-20 px-4">
        <h2 class="text-4xl font-black italic mb-12 uppercase">Il Nostro Team</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            {% for m in staff %}
            <div class="bg-[#111] p-6 rounded-2xl border-l-4" style="border-color: {{m.color}}">
                <img src="{{m.img}}" class="w-20 h-20 rounded-full mb-4 border border-white/10 shadow-xl">
                <h3 class="text-xl font-bold uppercase">{{m.name}}</h3>
                <p class="text-xs font-black opacity-50 uppercase tracking-widest" style="color: {{m.color}}">{{m.role}}</p>
            </div>
            {% endfor %}
        </div>
    </div>

    {% elif page == "shop" %}
    <div class="max-w-6xl mx-auto py-20 px-4">
        <h2 class="text-4xl font-black italic mb-12 uppercase">Platinum Store</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            {% for p in packages %}
            <div class="bg-[#111] p-10 rounded-3xl border border-white/5 flex flex-col justify-between hover:border-white/20 transition">
                <div>
                    <h3 class="text-2xl font-bold mb-2">{{p.name}}</h3>
                    <p class="text-gray-500 mb-6">{{p.desc}}</p>
                </div>
                <div>
                    <p class="text-4xl font-black mb-6">{{p.price}}</p>
                    <button class="w-full bg-white text-black font-bold py-3 rounded-xl">ACQUISTA</button>
                </div>
            </div>
            {% endfor %}
        </div>
    </div>

    {% elif page == "dashboard" %}
    <div class="max-w-4xl mx-auto py-20 px-4">
        <div class="flex justify-between items-center mb-10 bg-[#111] p-6 rounded-2xl">
            <h2 class="text-2xl font-bold">DASHBOARD ADMIN</h2>
            <p class="text-sm opacity-50">Admin: {{user.username}}</p>
        </div>

        <div class="bg-[#111] p-8 rounded-3xl mb-10">
            <h3 class="font-bold mb-4 uppercase text-gray-400">Aggiungi Staff</h3>
            <div class="grid grid-cols-2 gap-4 mb-4">
                <input id="n" type="text" placeholder="Nome" class="bg-black p-3 rounded-lg border border-white/5">
                <input id="r" type="text" placeholder="Ruolo" class="bg-black p-3 rounded-lg border border-white/5">
                <input id="c" type="color" class="w-full h-12 bg-black rounded-lg">
                <input id="i" type="text" placeholder="URL Immagine" class="bg-black p-3 rounded-lg border border-white/5">
            </div>
            <button onclick="add()" class="w-full bg-blue-600 py-3 rounded-xl font-bold">SALVA</button>
        </div>

        <div class="space-y-4">
            {% for m in staff %}
            <div class="bg-[#0a0a0a] p-4 rounded-xl flex justify-between items-center border border-white/5">
                <div class="flex items-center gap-4">
                    <img src="{{m.img}}" class="w-10 h-10 rounded-full">
                    <div><p class="font-bold">{{m.name}}</p><p class="text-xs opacity-40">{{m.role}}</p></div>
                </div>
                <button onclick="del({{loop.index0}})" class="text-red-500 font-bold">X</button>
            </div>
            {% endfor %}
        </div>
    </div>
    {% endif %}

    <script>
    async function sendTicket() {
        const data = { name: document.getElementById('t-name').value, subject: document.getElementById('t-sub').value, message: document.getElementById('t-msg').value };
        const res = await fetch('/api/ticket', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.dumps(data) });
        if(res.ok) alert("Ticket inviato!");
    }
    async function add() {
        const data = { name: document.getElementById('n').value, role: document.getElementById('r').value, color: document.getElementById('c').value, img: document.getElementById('i').value };
        await fetch('/api/admin/add', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
        location.reload();
    }
    async function del(i) {
        if(confirm("Eliminare?")) {
            await fetch('/api/admin/delete/'+i, { method:'DELETE' });
            location.reload();
        }
    }
    </script>
</body>
</html>
"""

# --- AVVIO SERVER ---
def run_flask():
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

if __name__ == "__main__":
    threading.Thread(target=run_flask).start()
    bot.run(TOKEN)
