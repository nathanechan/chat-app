export const storeMessage = (userId, message, targetId) => {
  const key = `messages_${userId}_${targetId}`;
  const messages = JSON.parse(localStorage.getItem(key) || '[]');
  messages.push(message);
  localStorage.setItem(key, JSON.stringify(messages));
};

export const getMessages = (userId, targetId) => {
  const key = `messages_${userId}_${targetId}`;
  return JSON.parse(localStorage.getItem(key) || '[]');
};

export const clearMessages = (userId, targetId) => {
  const key = `messages_${userId}_${targetId}`;
  localStorage.removeItem(key);
};