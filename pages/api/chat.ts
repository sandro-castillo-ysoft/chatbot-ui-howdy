export const config = {
  runtime: 'nodejs',
};

import { ChatBody, Message } from '@/types/chat';
import { DEFAULT_SYSTEM_PROMPT } from '@/utils/app/const';
import { OpenAIError, OpenAIStream } from '@/utils/server';
import tiktokenModel from '@dqbd/tiktoken/encoders/cl100k_base.json';
import { Tiktoken, init } from '@dqbd/tiktoken/lite/init';
// @ts-expect-error
import wasm from '../../node_modules/@dqbd/tiktoken/lite/tiktoken_bg.wasm?module';

import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { error } from 'console';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const ASSISTANT_ID = process.env.OPENAI_ASSIST_KEY_DEFAULT as string;
const threadMap = new Map<string, string>()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { prompt, sessionId } = req.body;

  try {
    let threadId = threadMap.get(sessionId)
    if(!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      threadMap.set(sessionId, threadId);
    }

    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: prompt,
    });

    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
    });

    let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    while (runStatus.status != 'completed') {
      await new Promise((r) => setTimeout(r, 250));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    }

    const messages = await openai.beta.threads.messages.list(threadId);

    const assistantReply = messages.data.find(m => m.role === 'assistant');
    const content = assistantReply?.content[0]?.text?.value || '⚠️ No assistant response';

    res.status(200).json({ message: content });


  } catch (err: any) {
    console.error(err?.response?.data || err.Message);
    res.status(500).json({error: 'OpenAI Chat completion failed'})
  }
}