import axios from 'axios';

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || 'https://api.openai.com/v1';

export const apiClient = axios.create({
  baseURL: API_ENDPOINT,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`,
  },
});

export const sendMessage = async (messages: Array<{ role: string; content: string }>) => {
  if (!API_KEY) {
    const lastMessage = messages[messages.length - 1]?.content || 'Nexus';
    return `Sem VITE_OPENAI_API_KEY configurada, estou usando resposta local. Para "${lastMessage}", consulte os domínios Geo, Resource, Service e Order no menu lateral; cada visão preserva as fronteiras TMF e a tríade Onde / O quê / Para quê.`;
  }

  try {
    const response = await apiClient.post('/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages,
      temperature: 0.7,
      max_tokens: 2000,
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};
