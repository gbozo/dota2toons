export interface WSMessage {
  type: string;
  payload: unknown;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private clientId: string;
  private reconnectTimeout: number | null = null;
  private defaultUrl: string;

  constructor(url?: string) {
    this.defaultUrl = url ?? 'ws://localhost:8080/ws';
    this.clientId = 'xxxx-xxxx-xxxx-xxxx'.replace(/x/g, () =>
      Math.floor(Math.random() * 16).toString(16)
    );
  }

  connect(
    onMessage?: (message: WSMessage) => void,
    onConnect?: () => void,
    onDisconnect?: () => void
  ): void {
    const wsUrl = `${this.defaultUrl}?clientId=${this.clientId}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WS connected:', this.clientId);
      onConnect?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WSMessage;
        onMessage?.(message);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('WS disconnected');
      onDisconnect?.();
      
      this.reconnectTimeout = window.setTimeout(() => {
        this.connect(onMessage, onConnect, onDisconnect);
      }, 3000);
    };

    this.ws.onerror = (error) => {
      console.error('WS error:', error);
    };
  }

  send(message: WSMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.ws?.close();
    this.ws = null;
  }

  getClientId(): string {
    return this.clientId;
  }
}