import { useState } from 'react';
import type { RoomMessageEventContent } from 'matrix-js-sdk/lib/@types/events';
import { accountManager } from '@/matrix/AccountManager';
import { useAccountsStore } from '@/state/accounts';
import { composeTextContent } from '@/lib/markdown';
import { Paperclip } from 'lucide-react';
import { uploadAndSendFile } from '@/matrix/attachments';

export function Composer() {
  const [value, setValue] = useState('');
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeRoomId = useAccountsStore((s) => s.activeRoomId);

  async function send() {
    if (!activeAccountId || !activeRoomId) return;
    const body = value.trim();
    if (!body) return;
    const client = accountManager.getClient(activeAccountId);
    if (!client) return;
    setValue('');
    const content = composeTextContent(body) as unknown as RoomMessageEventContent;
    try {
      await client.sendMessage(activeRoomId, content);
    } catch (err) {
      console.error('sendMessage failed', err);
      setValue(body);
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeAccountId || !activeRoomId) return;
    const client = accountManager.getClient(activeAccountId);
    if (!client) return;
    try {
      await uploadAndSendFile(client, activeRoomId, file);
    } catch (err) {
      console.error('file upload failed', err);
    } finally {
      e.target.value = '';
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const disabled = !activeAccountId || !activeRoomId;

  return (
    <div className="border-t border-[var(--color-divider)] p-4">
      <div className="flex items-end gap-2 rounded-lg bg-[var(--color-surface)] px-3 py-2">
        <label className="cursor-pointer text-neutral-400 hover:text-neutral-200">
          <Paperclip className="h-5 w-5" />
          <input
            type="file"
            className="hidden"
            onChange={onFileChange}
            disabled={disabled}
          />
        </label>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Select a room to chat' : 'Message'}
          rows={1}
          className="max-h-40 flex-1 resize-none bg-transparent py-1 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 disabled:opacity-60"
        />
      </div>
    </div>
  );
}
