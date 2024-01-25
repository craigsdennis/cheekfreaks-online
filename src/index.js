import { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import { serveStatic } from 'hono/cloudflare-workers';
import { HumanMessagePromptTemplate, SystemMessagePromptTemplate, ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { ChatCloudflareWorkersAI, CloudflareVectorizeStore, CloudflareWorkersAIEmbeddings } from '@langchain/cloudflare';

const app = new Hono();

const EMBEDDINGS_MODEL = '@cf/baai/bge-base-en-v1.5';

async function getSongs(bucket) {
	const listed = await bucket.list();
	const keys = listed.objects.map((obj) => obj.key);
	const songs = [];
	for (const key of keys) {
		const object = await bucket.get(key);
		const lyrics = await object.text();
		const title = lyrics.split('\n')[0];
		songs.push({
			title,
			lyrics,
			key,
		});
	}
	return songs;
}

app.get('/', serveStatic({ root: './index.html' }));

function formatDocsToLyrics(docs) {
	return docs
		.map((doc) => {
			return `Song: ${doc.metadata.title}
    
    ${doc.pageContent}`;
		})
		.join('\n\n');
}

app.post('/prompt', async (c) => {
	const body = await c.req.json();
	const embeddings = new CloudflareWorkersAIEmbeddings({
		binding: c.env.AI,
		modelName: EMBEDDINGS_MODEL,
	});
	const store = new CloudflareVectorizeStore(embeddings, {
		index: c.env.VECTORIZE_INDEX,
	});
	console.log(`Setting AI model ${body.model}`);
	const chat = new ChatCloudflareWorkersAI({
		model: body.model,
		cloudflareAccountId: c.env.CLOUDFLARE_ACCOUNT_ID,
		cloudflareApiToken: c.env.CLOUDFLARE_API_TOKEN,
	});

	const vectorStoreRetriever = store.asRetriever();

	const userMessage = body.userMessage;
	const messageObjects = body.messages.map((msg) => {
		return [msg.role === 'assistant' ? 'ai' : msg.role, msg.content];
	});
	console.log('Trying to send the user message', userMessage);
	const prompt = ChatPromptTemplate.fromMessages([
		SystemMessagePromptTemplate.fromTemplate(`
    You are a huge fan of the band Cheekface. 
    
    You are known as a Cheekfreak. 
    
    You are obsessed with the band and especially their lyrics, you always quote them.

    The lyrics are included below and are relevant to your conversation. 
    
    Use at least one lyric, and/or song title in context of the conversation in every single response. 
    
    Stay conversational and quirky to keep things moving.
    
    You should never talk about their albums, only about the lyrics.

    Limit yourself to 5 or fewer sentences.
    
    Do not make up your own lyrics.

    If you cannot find a relevant one for the conversation, just say the first lyric.
    
    <lyrics>
    {lyrics}
    </lyrics>
    `),
		...messageObjects,
		HumanMessagePromptTemplate.fromTemplate('{userMessage}'),
	]);

	const chain = RunnableSequence.from([
		{
			lyrics: vectorStoreRetriever.pipe(formatDocsToLyrics),
			userMessage: new RunnablePassthrough(),
		},
		prompt,
		chat,
		new StringOutputParser(),
	]);

	const chainStream = await chain.stream(userMessage);
	return streamText(c, async (stream) => {
		for await (const token of chainStream) {
			stream.write(token);
		}
	});
});

// Quick test to make sure we are getting back documents we want
app.get('/search', async (c) => {
	const query = c.req.query('q');
	const embeddings = new CloudflareWorkersAIEmbeddings({
		binding: c.env.AI,
		modelName: EMBEDDINGS_MODEL,
	});
	const store = new CloudflareVectorizeStore(embeddings, {
		index: c.env.VECTORIZE_INDEX,
	});
	const results = await store.similaritySearch(query, 5);
	return Response.json(results);
});

app.get('/load-em-up', async (c) => {
	const embeddings = new CloudflareWorkersAIEmbeddings({
		binding: c.env.AI,
		modelName: EMBEDDINGS_MODEL,
	});
	const store = new CloudflareVectorizeStore(embeddings, {
		index: c.env.VECTORIZE_INDEX,
	});
	console.log('Getting songs from R2');
	const songs = await getSongs(c.env.LYRICS_BUCKET);
	console.log(`Retrieved ${songs.length}`);
	// Chunk and split
	const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 200, chunkOverlap: 10 });
	for (const song of songs) {
		const docs = await splitter.createDocuments([song.lyrics], [{ title: song.title, key: song.key }]);
		console.log(`${song.title} created ${docs.length} docs`);
		console.log('First one:', JSON.stringify(docs[0]));
		console.log(`Adding to Vectorize`);
		// FIXME: Vectorize doesn't like this loc `object` type
		//docs.forEach((doc) => delete doc.metadata.loc);
		const indexedIds = await store.addDocuments(docs);
		console.log(`Inserted ${JSON.stringify(indexedIds)}`);
	}
});

export default app;
