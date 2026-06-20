import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type Redis from 'ioredis';

export class WsAdapter extends IoAdapter {
  private subClient: Redis | null = null;

  constructor(
    app: INestApplicationContext,
    private corsOrigins: string[],
    private pubClient: Redis,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      path: '/realtime',
      cors: {
        origin: this.corsOrigins,
        credentials: true,
      },
    }) as Server;

    this.subClient = this.pubClient.duplicate();
    server.adapter(createAdapter(this.pubClient, this.subClient));

    return server;
  }

  async close(server: Server): Promise<void> {
    await super.close(server);
    if (this.subClient) {
      await this.subClient.quit();
      this.subClient = null;
    }
  }
}
