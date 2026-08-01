import os
import threading
import discord
from discord.ext import commands
from discord import app_commands
from dotenv import load_dotenv
from flask import Flask

# Carica le variabili d'ambiente dal file .env
load_dotenv()
TOKEN = os.getenv("DISCORD_TOKEN")

# --- CONFIGURAZIONE FLASK (Server Web) ---
app = Flask(__name__)

@app.route("/")
def home():
    return "Il bot Discord è attivo e online! 🚀"

def run_flask():
    app.run(host="0.0.0.0", port=8080)

flask_thread = threading.Thread(target=run_flask)
flask_thread.daemon = True
flask_thread.start()

# --- CONFIGURAZIONE DISCORD BOT ---
intents = discord.Intents.default()
intents.guilds = True
intents.messages = True
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

# Funzione universale per normalizzare qualsiasi font Unicode e trasformarlo in Serif Italic (𝐺𝑒𝑛𝑒𝑟𝑎𝑙𝑒)
def universal_to_serif_italic(text: str) -> str:
    normal_lower = "abcdefghijklmnopqrstuvwxyz"
    normal_upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    
    serif_italic_lower = "𝑎𝑏𝑐𝑑𝑒𝑓𝑔ℎ𝑖𝑗𝑘𝑙𝑚𝑛𝑜𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑥𝑦𝑧"
    serif_italic_upper = "𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾𝐿𝑀𝑁𝑂𝑃𝑄𝑅𝑆𝑇𝑈𝑉𝑊𝑋𝑌𝑍"

    result = []
    for char in text:
        code = ord(char)
        if ord('a') <= code <= ord('z'):
            idx = code - ord('a')
            result.append(serif_italic_lower[idx])
        elif ord('A') <= code <= ord('Z'):
            idx = code - ord('A')
            result.append(serif_italic_upper[idx])
        else:
            if 0x1D5D4 <= code <= 0x1D5ED: # Sans-Serif Bold A-Z
                result.append(serif_italic_upper[code - 0x1D5D4])
            elif 0x1D5EE <= code <= 0x1D607: # Sans-Serif Bold a-z
                result.append(serif_italic_lower[code - 0x1D5EE])
            elif 0x1D5A0 <= code <= 0x1D5B9: # Sans-Serif Regular A-Z
                result.append(serif_italic_upper[code - 0x1D5A0])
            elif 0x1D5BA <= code <= 0x1D5D3: # Sans-Serif Regular a-z
                result.append(serif_italic_lower[code - 0x1D5BA])
            elif 0x1D400 <= code <= 0x1D419: # Serif Bold A-Z
                result.append(serif_italic_upper[code - 0x1D400])
            elif 0x1D41A <= code <= 0x1D433: # Serif Bold a-z
                result.append(serif_italic_lower[code - 0x1D41A])
            elif char == ' ' or char == '-':
                result.append('_')
            else:
                result.append(char)
                
    return "".join(result)

# Funzione per estrarre l'emoji e il nome dal vecchio canale
def extract_emoji_and_name(old_name: str):
    cleaned = old_name.strip()
    if cleaned:
        first_char = cleaned[0]
        if not first_char.isalnum():
            for sep in ["｜", "|", " - ", "_", " ", "ヾ"]:
                if sep in cleaned:
                    parts = cleaned.split(sep, 1)
                    potential_emoji = parts[0].strip()
                    rest_of_name = parts[1].strip()
                    if potential_emoji:
                        return potential_emoji, rest_of_name
            return first_char, cleaned[1:].strip()
    return "💬", cleaned

@bot.event
async def on_ready():
    print(f"Bot online come {bot.user}")
    try:
        synced = await bot.tree.sync()
        print(f"Sincronizzati {len(synced)} slash commands.")
    except Exception as e:
        print(e)

# --- COMANDO 1: RINOMINA CANALI ---
@bot.tree.command(name="rinomina_canali", description="Converte qualsiasi font esistente nel font 𝐺𝑒𝑛𝑒𝑟𝑎𝑙𝑒 mantenendo l'emoji.")
@app_commands.checks.has_permissions(manage_channels=True)
async def rinomina_canali(interaction: discord.Interaction):
    await interaction.response.defer(thinking=True)
    
    guild = interaction.guild
    count = 0

    for channel in guild.channels:
        # Corretto: saltiamo correttamente le categorie
        if isinstance(channel, discord.CategoryChannel):
            continue

        extracted_emoji, base_name = extract_emoji_and_name(channel.name)
        base_name = base_name.replace("ヾ", "").strip()
        formatted_name = universal_to_serif_italic(base_name)
        new_name = f"{extracted_emoji}ヾ{formatted_name}"

        try:
            await channel.edit(name=new_name)
            count += 1
        except Exception as e:
            print(f"Errore nel rinominare {channel.name}: {e}")

    await interaction.followup.send(f"Fatto! Ho convertito {count} canali nel font 𝐺𝑒𝑛𝑒𝑟𝑎𝑙𝑒.")

# --- COMANDO 2: INVERTI RUOLI ---
@bot.tree.command(name="inverti_ruoli", description="Inverte l'ordine dei ruoli del server spostando quelli in basso in alto.")
@app_commands.checks.has_permissions(manage_roles=True)
async def inverti_ruoli(interaction: discord.Interaction):
    await interaction.response.defer(thinking=True)
    
    guild = interaction.guild
    bot_member = guild.me
    managed_roles = [r for r in guild.roles if not r.is_default() and r < bot_member.top_role]
    
    if not managed_roles:
        await interaction.followup.send("Non ci sono ruoli gestibili o inferiori al ruolo del bot da invertire.", ephemeral=True)
        return

    reversed_roles = list(reversed(managed_roles))
    
    try:
        positions_dict = {}
        original_positions = sorted([role.position for role in managed_roles])
        
        for i, role in enumerate(reversed_roles):
            positions_dict[role] = original_positions[i]
            
        await guild.edit_role_positions(positions_dict)
        await interaction.followup.send(f"Fatto! L'ordine dei {len(managed_roles)} ruoli è stato invertito con successo.")
    except Exception as e:
        await interaction.followup.send(f"Errore durante l'inversione dei ruoli: {e}", ephemeral=True)

# Gestione degli errori corretta per evitare conflitti con interaction già risposte
@rinomina_canali.error
@inverti_ruoli.error
async def command_error(interaction: discord.Interaction, error):
    if isinstance(error, app_commands.MissingPermissions):
        msg = "Non hai i permessi necessari per eseguire questo comando."
    else:
        msg = "Si è verificato un errore durante l'esecuzione del comando."
        
    if interaction.response.is_done():
        await interaction.followup.send(msg, ephemeral=True)
    else:
        await interaction.response.send_message(msg, ephemeral=True)

if __name__ == "__main__":
    if not TOKEN:
        print("Errore: Token di Discord non trovato nel file .env!")
    else:
        bot.run(TOKEN)
