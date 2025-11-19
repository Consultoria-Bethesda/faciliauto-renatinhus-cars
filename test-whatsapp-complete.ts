#!/usr/bin/env tsx
import 'dotenv/config';
import axios from 'axios';

const META_API_URL = `https://graph.facebook.com/v18.0/${process.env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`;
const ACCESS_TOKEN = process.env.META_WHATSAPP_TOKEN;

// Substitua pelo seu número (formato internacional, sem + e sem espaços)
const YOUR_PHONE = '5511937761896'; // Ex: 5511999999999

async function sendTestMessage() {
  console.log('📱 Testando envio de mensagem WhatsApp...\n');
  
  console.log('Configurações:');
  console.log(`  Phone Number ID: ${process.env.META_WHATSAPP_PHONE_NUMBER_ID}`);
  console.log(`  Token: ${ACCESS_TOKEN?.substring(0, 20)}...`);
  console.log(`  Destinatário: ${YOUR_PHONE}\n`);

  try {
    const response = await axios.post(
      META_API_URL,
      {
        messaging_product: 'whatsapp',
        to: YOUR_PHONE,
        type: 'text',
        text: {
          body: '🚗 Olá! Sou o assistente da FaciliAuto. Estou online e pronto para ajudar você a encontrar o carro ideal! Como posso te ajudar hoje?'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Mensagem enviada com sucesso!');
    console.log('📊 Resposta:', JSON.stringify(response.data, null, 2));
    console.log('\n💡 Agora responda a mensagem no WhatsApp para testar o webhook!');
  } catch (error: any) {
    console.error('❌ Erro ao enviar mensagem:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Dados:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

sendTestMessage();
