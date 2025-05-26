export const request = () => {
  throw new Error('HTTPS operations should use fetch API in browser environment');
};

export default {
  request
};

