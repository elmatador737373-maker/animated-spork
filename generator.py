import os
import random
import string
import threading
import time
import requests
from flask import Flask

# Inserisci il tuo Webhook qui sotto
DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1538940427636449391/wTrHhBcyLy9FbXJ8NqTJ6DgvyhQ-m_Ar1RRcbZQtbujizHP8JtyDDlnNZpsmlwA-tWiK"

app = Flask(__name__)


@app.route("/")
def home():
    """Endpoint di controllo per la health-check di Render."""
    return "Bot status: Running", 200


def generate_random_string(length=18):
    characters = string.ascii_letters + string.digits
    return "".join(random.choice(characters) for _ in range(length))


def send_to_discord(message):
    data = {"content": message}
    try:
        response = requests.post(DISCORD_WEBHOOK_URL, json=data, timeout=10)
        if response.status_code == 204:
            print("Messaggio inviato a Discord con successo.")
        else:
            print(f"Errore invio Discord ({response.status_code}): {response.text}")
    except Exception as e:
        print(f"Eccezione durante l'invio a Discord: {e}")


def send_request(code):
    url = f"https://discordapp.com/api/v9/entitlements/gift-codes/{code}?with_application=false&with_subscription_plan=true"
    print(f"[{time.strftime('%H:%M:%S')}] Request per codice: {code}")

    try:
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            msg = f"🎉 **Codice valido trovato!**: {code}"
            print(msg)
            send_to_discord(msg)

        elif response.status_code == 429:  # Rate Limit
            retry_after = response.json().get("retry_after", 5000)
            wait_seconds = (retry_after / 1000) + 1
            msg = f"⚠️ **Rate Limit raggiunto!** Attesa di {wait_seconds:.2f} secondi..."
            print(msg)
            send_to_discord(msg)

        else:
            msg = f"❌ Codice non valido ({response.status_code}): {code}"
            print(msg)
            send_to_discord(msg)  # <--- Invia il messaggio anche per i codici falliti

    except Exception as e:
        msg = f"⚠️ Errore durante la richiesta API per {code}: {e}"
        print(msg)
        send_to_discord(msg)


def worker_loop():
    while True:
        code = generate_random_string(18)
        send_request(code)
        time.sleep(5)


if __name__ == "__main__":
    # Test immediato del Webhook all'avvio dello script
    send_to_discord("🚀 **Bot avviato su Render**: Test connessione Webhook riuscito!")

    # Avvia il loop dei codici in background
    threading.Thread(target=worker_loop, daemon=True).start()

    # Avvia il server Flask sulla porta dinamica di Render
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
