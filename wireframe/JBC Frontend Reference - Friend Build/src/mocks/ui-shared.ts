export const apiRequest = async <T,>(url: string, options?: any): Promise<T> => {
  console.log(`[MOCK API] Request to ${url}`, options);
  // Return a generic mock array or object depending on expected usage
  return [] as any as T;
};

export const useAuth = () => {
  return {
    accessToken: 'mock-token',
    user: { id: 'mock-user', name: 'Guest User' }
  };
};

export const useTenant = () => {
  return {
    tenant: { id: 't1', name: 'JBC', themeColor: '#059669' }
  };
};

export const formatBookingReference = (id: string) => {
  return `JBC-${id.substring(0, 6).toUpperCase()}`;
};
