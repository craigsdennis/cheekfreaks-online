import {
    ChatPromptTemplate,
	SystemMessagePromptTemplate,
    HumanMessagePromptTemplate,
} from '@langchain/core/prompts';
import {AIMessage, HumanMessage} from '@langchain/core/messages'


const messages = [
    SystemMessagePromptTemplate.fromTemplate("Hey there {lyrics}"),
    new HumanMessage("Hey"),
    new AIMessage("Sup?"),
    HumanMessagePromptTemplate.fromTemplate("{userQuestion}")
];

const prompt = ChatPromptTemplate.fromMessages(messages);
console.dir(await prompt.formatMessages({lyrics: "Imagine", userQuestion: "Please"}));


