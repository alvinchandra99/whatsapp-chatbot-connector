import axios, { AxiosError } from "axios";
import dotenv from "dotenv";
import { queryToDify } from "./dify";
import { queryToRasa } from "./rasa";
import { config } from "../utils/config";

dotenv.config();

const DIFY = "dify";
const RASA = "rasa";

const {
  GRAPH_API_TOKEN,
  BUSINESS_PHONE_NUMBER_ID,
  CONNECTION_PLATFORM,
  WA_TIMEOUT,
  PHONE_NUMBER,
  WHATSAPP_BUSINESS_ACCOUNT_ID
} = config;

const BASE_URL = `https://graph.facebook.com/v19.0/${BUSINESS_PHONE_NUMBER_ID}`;

const AxiosInstanceWhatsapp = axios.create({
  baseURL: BASE_URL,
  timeout: WA_TIMEOUT,
  timeoutErrorMessage: "Connection timed out",
});

export const sendChatbotReply = async ({
  to,
  chatbotReply,
}: {
  to: string;
  chatbotReply: {
    text: string;
    type?: string;
    buttons?: { type: "reply"; reply: { id: string; title: string } }[];
    rows?: { id: string; title: string; description: string }[];
  };
}) => {
  switch (chatbotReply?.type) {
    case "interactive-button":
      return await sendInteractiveReplyButton({
        to,
        text: chatbotReply.text,
        buttons: chatbotReply.buttons,
      });
    case "interactive-list":
      return await sendInteractiveListMessage({
        to,
        text: chatbotReply.text,
        rows: chatbotReply.rows,
      });
    default:
      return await sendTextMessage({ to, text: chatbotReply.text });
  }
};

export const sendTextMessage = async ({
  to,
  text,
}: {
  to: string;
  text: string;
}) => {
  try {
    return await AxiosInstanceWhatsapp({
      method: "POST",
      url: `${BASE_URL}/messages`,
      headers: {
        Authorization: `Bearer ${GRAPH_API_TOKEN}`,
      },
      data: {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: true, body: text },
      },
    });
  } catch (error: unknown) {
    console.error(
      `Error sendTextMessage: ${JSON.stringify(
        (error as AxiosError)?.response?.data || error
      )}`
    );
  }
};

export const sendInteractiveReplyButton = async ({
  to,
  text,
  buttons,
}: {
  to: string;
  text: string;
  buttons?: {
    type: "reply";
    reply: {
      id: string;
      title: string;
    };
  }[];
}) => {
  try {
    return await AxiosInstanceWhatsapp({
      method: "POST",
      url: `${BASE_URL}/messages`,
      headers: {
        Authorization: `Bearer ${GRAPH_API_TOKEN}`,
      },
      data: {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          header: { type: "text", text: "" },
          body: { text },
          footer: { text: "" },
          action: { buttons },
        },
      },
    });
  } catch (error: unknown) {
    console.error(
      `Error sendInteractiveReplyButton: ${JSON.stringify(
        (error as AxiosError)?.response?.data || error
      )}`
    );
  }
};

export const sendInteractiveListMessage = async ({
  to,
  text,
  rows,
}: {
  to: string;
  text: string;
  rows?: {
    id: string;
    title: string;
    description: string;
  }[];
}) => {
  try {
    return await AxiosInstanceWhatsapp({
      method: "POST",
      url: `${BASE_URL}/messages`,
      headers: {
        Authorization: `Bearer ${GRAPH_API_TOKEN}`,
      },
      data: {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: "" },
          body: { text },
          footer: { text: "" },
          action: { sections: [{ title: "", rows }], button: "Menu" },
        },
      },
    });
  } catch (error: unknown) {
    console.error(
      `Error sendInteractiveListMessage: ${JSON.stringify(
        (error as AxiosError)?.response?.data || error
      )}`
    );
  }
};

export const markChatAsRead = async (messageId: string) => {
  return await AxiosInstanceWhatsapp({
    method: "POST",
    url: `${BASE_URL}/messages`,
    headers: {
      Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    },
    data: {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    },
  });
};

// helpers
export const _markChatAsRead = async (messageId: string) => {
  try {
    await markChatAsRead(messageId);
  } catch (error) {
    console.error("Error markChatAsRead: " + error);
    console.error((error as AxiosError)?.response?.data);
  }
};

export const _queryAndReply = async (payloadString: string) => {
  const payload = JSON.parse(payloadString);
  const { query, messageFrom } = payload;
  let chatbotReply = null;

  try {
    if (CONNECTION_PLATFORM === DIFY) {
      chatbotReply = await queryToDify({ waId: messageFrom, query });
    } else if (CONNECTION_PLATFORM === RASA) {
      chatbotReply = await queryToRasa({ waId: messageFrom, query });
    }
    console.log("[Chatbot reply] phone: %s", messageFrom, chatbotReply);
  } catch (error) {
    console.error("Error queryToPlatform: " + error);
    console.error((error as AxiosError)?.response?.data);
  }

  if (!chatbotReply || !chatbotReply.text) {
    // do nothing
    return;
  }

  try {
    const whatsappResponse = await sendChatbotReply({ to: messageFrom, chatbotReply });

    if (whatsappResponse && whatsappResponse.data) {
      console.log("WhatsApp response:", whatsappResponse.data);
      // Forward the WhatsApp response to Chatwoot
      try {
        let messageEchos = {
          "object": "whatsapp_business_account",
          "entry": [
            {
              "id": WHATSAPP_BUSINESS_ACCOUNT_ID,
              "changes": [
                {
                  "field": "messages",
                  "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {
                      "display_phone_number": PHONE_NUMBER,
                      "phone_number_id": BUSINESS_PHONE_NUMBER_ID
                    },
                    "contacts":[
                      {
                        "profile": {
                          "name": PHONE_NUMBER
                        },
                        "wa_id": PHONE_NUMBER
                      }
                    ],
                    "messages": [
                      {
                        "from": PHONE_NUMBER,
                        // "to": messageFrom,
                        "id": whatsappResponse.data.messages[0].id,
                        "timestamp": Math.floor(Date.now() / 1000),
                        "type": "text",
                        "text": {
                          "body": chatbotReply.text
                        }
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
        const chatwootResponse = await axios.post(
          `https://chat.solvea.id/webhooks/whatsapp/${PHONE_NUMBER}`,
          messageEchos
        );
        console.log(
          `[Chatwoot] Forwarded WhatsApp response to Chatwoot with status: ${chatwootResponse.status} and messageEchos: ${JSON.stringify(messageEchos)}`
        );
      } catch (error) {
        console.error("[Chatwoot] Error forwarding WhatsApp response:", error);
      }
    } else {
      console.error("WhatsApp response is undefined or missing data.");
    }
  } catch (error) {
    console.error("Error sendChatbotReply: " + error);
    console.error((error as AxiosError)?.response?.data);
  }
};