const getWebSocketBaseURL = () => {
  return process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
};
  
  export default getWebSocketBaseURL;