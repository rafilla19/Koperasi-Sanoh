import { apiUrl } from './api';

export const fetchWASettings = async () => {
	const response = await fetch(apiUrl('/whatsapp/'));
	if (!response.ok) {
		throw new Error('Failed to load WhatsApp settings');
	}
	return response.json();
};

export default fetchWASettings;
