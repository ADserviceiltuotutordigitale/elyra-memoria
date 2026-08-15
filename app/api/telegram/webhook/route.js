import { eseguiCattura } from "@/lib/capture";
import { rispondiADomanda } from "@/lib/domande";
import { eDomanda } from "@/lib/testo";
import { rilevaAzioneSuTask } from "@/lib/azioni";
import { updateTask, completeTask, deleteTask } from "@/lib/store";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function inviaMessaggio(chatId, testo, replyMarkup) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: testo, reply_markup: replyMarkup }),
  });
}

async function rispondiCallback(callbackQueryId, testo) {
  // Sempre, altrimenti il pulsante resta a girare sul telefono (Parte 4).
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text: testo }),
  });
}

async function trascriviAudio(fileId) {
  const infoRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  const info = await infoRes.json();
  const filePath = info.result?.file_path;
  if (!filePath) return "";

  const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const audioRes = await fetch(fileUrl);
  const audioBuffer = await audioRes.arrayBuffer();

  // Formato ed estensione dichiarati esplicitamente: con un MIME sbagliato
  // Whisper restituisce il nulla invece di protestare (Parte 8).
  const blob = new Blob([audioBuffer], { type: "audio/ogg" });
  const form = new FormData();
  form.append("file", blob, "audio.ogg");
  form.append("model", "whisper-1");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  const whisperBody = await whisperRes.json();
  return whisperBody.text || "";
}

function tastieraUrgenza(taskId) {
  return {
    inline_keyboard: [
      [
        { text: "Oggi", callback_data: `urg:${taskId}:oggi` },
        { text: "Settimana", callback_data: `urg:${taskId}:settimana` },
        { text: "Più avanti", callback_data: `urg:${taskId}:piu_avanti` },
      ],
    ],
  };
}

async function gestisciMessaggio(message) {
  if (String(message.from?.id) !== process.env.TELEGRAM_USER_ID) return;

  const chatId = message.chat.id;
  let testo = message.text;

  if (message.voice) {
    testo = await trascriviAudio(message.voice.file_id);
    if (!testo.trim()) {
      await inviaMessaggio(chatId, "Non sono riuscita a capire la nota vocale — riprova.");
      return;
    }
  }
  if (!testo || !testo.trim()) return;

  // Stessa barra, doppio uso: se sembra una domanda risponde invece di
  // archiviare — stesso riconoscimento della dashboard (Parte 6, A17).
  if (eDomanda(testo)) {
    try {
      const { risposta } = await rispondiADomanda(testo);
      await inviaMessaggio(chatId, risposta);
    } catch {
      await inviaMessaggio(chatId, "Non sono riuscita a rispondere — riprova.");
    }
    return;
  }

  // Prima di archiviare come nota nuova, controlla se è un comando su un
  // task esistente ("rimuovi X", "completa X") — Parte 6-bis. Se il
  // modello non trova un id sicuro, azione resta null e il testo prosegue
  // come cattura normale, invariato rispetto a prima.
  const { azione, taskId, titolo: titoloTask } = await rilevaAzioneSuTask(testo);
  if (azione === "elimina") {
    await deleteTask(taskId);
    await inviaMessaggio(chatId, `Rimosso: "${titoloTask}"`);
    return;
  }
  if (azione === "completa") {
    await completeTask(taskId);
    await inviaMessaggio(chatId, `Completato: "${titoloTask}"`);
    return;
  }

  const risultato = await eseguiCattura(testo, { provenienza: "telegram" });
  const tastiera = risultato.task ? tastieraUrgenza(risultato.task.id) : undefined;

  await inviaMessaggio(chatId, `Archiviato in ${risultato.destinazione}: "${risultato.titolo}"`, tastiera);
}

async function gestisciCallback(callbackQuery) {
  try {
    if (String(callbackQuery.from?.id) !== process.env.TELEGRAM_USER_ID) {
      await rispondiCallback(callbackQuery.id, "Non autorizzato");
      return;
    }

    const [azione, taskId, nuovaUrgenza] = (callbackQuery.data || "").split(":");
    if (azione !== "urg" || !taskId || !nuovaUrgenza) {
      await rispondiCallback(callbackQuery.id, "Comando non valido");
      return;
    }

    await updateTask(taskId, { fascia: nuovaUrgenza });
    await rispondiCallback(callbackQuery.id, `Aggiornato: ${nuovaUrgenza}`);
  } catch {
    await rispondiCallback(callbackQuery.id, "Errore, riprova");
  }
}

export async function POST(request) {
  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
  if (secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("non autorizzato", { status: 401 });
  }

  const update = await request.json().catch(() => null);

  // Risponde sempre 200 da qui in poi: se rispondessimo con un errore,
  // Telegram riprova e la stessa nota finisce archiviata più volte (Parte 8).
  try {
    if (update?.callback_query) {
      await gestisciCallback(update.callback_query);
    } else if (update?.message) {
      await gestisciMessaggio(update.message);
    }
  } catch (err) {
    console.error("[telegram webhook]", err);
  }

  return Response.json({ ok: true });
}
