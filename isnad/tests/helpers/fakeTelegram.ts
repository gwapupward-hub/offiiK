import {
  TelegramApiError,
  type BotIdentity,
  type SendMessageParams,
  type TelegramClient,
} from "@/lib/community/telegramApi";
import type { TelegramChatFull, TelegramChatMember } from "@/lib/community/types";

type Method = "getMe" | "getChat" | "getChatMember" | "sendMessage";

/** In-memory Bot API used by tests. Unknown members are reported as "left". */
export class FakeTelegram implements TelegramClient {
  readonly botId: number;
  me: BotIdentity;
  readonly chats = new Map<number, TelegramChatFull>();
  readonly members = new Map<string, TelegramChatMember>();
  readonly sent: SendMessageParams[] = [];
  readonly calls: { method: Method; args: unknown[] }[] = [];
  private failures = new Map<Method, Error[]>();

  constructor(botId = 123456, username = "isnad_test_bot") {
    this.botId = botId;
    this.me = { id: botId, is_bot: true, username, first_name: "Isnad", can_read_all_group_messages: false };
  }

  setChat(chat: TelegramChatFull) {
    this.chats.set(chat.id, chat);
  }

  setMember(chatId: number, userId: number, member: Partial<TelegramChatMember> & { status: TelegramChatMember["status"] }) {
    this.members.set(`${chatId}:${userId}`, { user: { id: userId }, ...member });
  }

  failNext(method: Method, error: Error) {
    const queue = this.failures.get(method) ?? [];
    queue.push(error);
    this.failures.set(method, queue);
  }

  private maybeFail(method: Method, args: unknown[]) {
    this.calls.push({ method, args });
    const error = this.failures.get(method)?.shift();
    if (error) throw error;
  }

  async getMe() {
    this.maybeFail("getMe", []);
    return this.me;
  }

  async getChat(chatId: number) {
    this.maybeFail("getChat", [chatId]);
    const chat = this.chats.get(chatId);
    if (!chat) throw new TelegramApiError("getChat", "api", "Bad Request: chat not found", { errorCode: 400 });
    return chat;
  }

  async getChatMember(chatId: number, userId: number) {
    this.maybeFail("getChatMember", [chatId, userId]);
    if (!this.chats.has(chatId)) {
      throw new TelegramApiError("getChatMember", "api", "Bad Request: chat not found", { errorCode: 400 });
    }
    return this.members.get(`${chatId}:${userId}`) ?? { status: "left" as const, user: { id: userId } };
  }

  async sendMessage(params: SendMessageParams) {
    this.maybeFail("sendMessage", [params]);
    this.sent.push(params);
    return { message_id: 1000 + this.sent.length };
  }

  reset() {
    this.sent.length = 0;
    this.calls.length = 0;
  }
}
