# Cheekfreaks Online

An exploration using [Workers AI](https://developers.cloudflare.com/workers-ai/) w/ Hono and [LangChain](https://js.langchain.com/docs/integrations/vectorstores/cloudflare_vectorize) [abstractions](https://js.langchain.com/docs/integrations/chat/cloudflare_workersai) to build a super music fan that you can chat with.

Lyrics are uploaded as text files to R2, which is then used to create [embeddings](https://js.langchain.com/docs/integrations/text_embedding/cloudflare_ai) and store them in Cloudflare's vector database [Vectorize](https://js.langchain.com/docs/integrations/text_embedding/cloudflare_ai).

Chat pulls relevant lyrics.

This, like all of us, is a work in progress.

## Installation

```bash
npx wrangler vectorize create lyrics --preset "@cf/baai/bge-base-en-v1.5"
```

Upload songs in separate files to R2

## TODO

- [ ] Create character profiles based on songs, allow chatting with different folks