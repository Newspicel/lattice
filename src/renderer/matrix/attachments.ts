import type { MatrixClient } from 'matrix-js-sdk';
import type { RoomMessageEventContent } from 'matrix-js-sdk/lib/@types/events';
import { MsgType } from 'matrix-js-sdk';

function inferMsgType(mime: string): MsgType.Image | MsgType.Video | MsgType.Audio | MsgType.File {
  if (mime.startsWith('image/')) return MsgType.Image;
  if (mime.startsWith('video/')) return MsgType.Video;
  if (mime.startsWith('audio/')) return MsgType.Audio;
  return MsgType.File;
}

async function readImageDimensions(file: File): Promise<{ w: number; h: number } | null> {
  if (!file.type.startsWith('image/')) return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export async function uploadAndSendFile(
  client: MatrixClient,
  roomId: string,
  file: File,
): Promise<void> {
  const msgtype = inferMsgType(file.type);
  const info: Record<string, unknown> = {
    mimetype: file.type || 'application/octet-stream',
    size: file.size,
  };
  const dims = await readImageDimensions(file);
  if (dims) {
    info.w = dims.w;
    info.h = dims.h;
  }

  const upload = await client.uploadContent(file, {
    name: file.name,
    type: file.type,
  });

  const content = {
    msgtype,
    body: file.name,
    url: upload.content_uri,
    info,
  } as unknown as RoomMessageEventContent;
  await client.sendMessage(roomId, content);
}
