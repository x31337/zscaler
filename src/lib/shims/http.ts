export const request = () => {
  throw new Error('HTTP operations should use fetch API in browser environment');
};

export default {
  request
};

