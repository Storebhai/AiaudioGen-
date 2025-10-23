
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { COURSE_OUTLINE_SCHEMA, LECTURE_DETAILS_SCHEMA } from '../constants';
import type { Course, InputType, Lecture } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set.");
}

// Main AI instance for text/audio tasks
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function generateCourseOutline(
    inputType: InputType,
    inputValue: string,
    language: string,
    mimeType?: string
): Promise<Course> {
    const languageInstruction = `The entire course outline, including all titles and goals, MUST be in ${language}. For 'Hinglish', use a mix of Hindi and English, written in the Latin script.`;
    const basePrompt = `You are an expert instructional designer creating mobile-first audio courses. Your goal is to break down complex topics into simple, clear, and engaging audio lectures for a general audience.
    
Based on the provided input, your task is to generate ONLY a course outline. The outline must include a course title, an estimated total duration for the entire course, and a list of 4-6 lecture titles, each with 2-3 learning goals.

DO NOT generate the full scripts, summaries, or quizzes. Only the high-level outline is needed for this step.`;
    
    try {
        let responseText: string;
        const modelName = 'gemini-2.5-flash';

        if (inputType === 'topic' || inputType === 'youtube') {
            let sourceDescription = '';
            let contentConstraint = '';
            if (inputType === 'topic') {
                sourceDescription = `Use your search tool to find up-to-date and accurate information on the topic: "${inputValue}".`;
                contentConstraint = 'Based on your findings, generate a course outline.';
            } else { // youtube
                sourceDescription = `Use your tools to find the transcript or a detailed summary of the YouTube video at this URL: "${inputValue}".`;
                contentConstraint = `Based **only** on the content of that video, generate a course outline.`;
            }

            const prompt = `${basePrompt}\n\n${sourceDescription}\n\n${contentConstraint}\n\n${languageInstruction}\n\nThe output MUST be a single, valid JSON object. Do not include any text, markdown, or explanations outside of the JSON object.`;
            
            const response = await ai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    tools: [{ googleSearch: {} }],
                },
            });
            responseText = response.text;
        
        } else if (inputType === 'video') {
            if (!mimeType) throw new Error("Mime type is required for video input.");
            const prompt = `${basePrompt}\n\nAnalyze the content of the provided video and generate a course outline based on it.\n\n${languageInstruction}\n\nThe output MUST be a single, valid JSON object that strictly adheres to the provided schema. Do not include any text, markdown, or explanations outside of the JSON object.`;

            const videoPart = {
                inlineData: {
                    data: inputValue,
                    mimeType: mimeType,
                },
            };
            const textPart = { text: prompt };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: { parts: [videoPart, textPart] },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: COURSE_OUTLINE_SCHEMA,
                },
            });
            responseText = response.text;

        } else { // For 'text' and 'pdf'
            const prompt = `${basePrompt}\n\nAnalyze the following text content and generate a course outline based on it.\n\nCONTENT:\n---\n${inputValue}\n---\n\n${languageInstruction}\n\nThe output MUST be a single, valid JSON object that strictly adheres to the provided schema. Do not include any text, markdown, or explanations outside of the JSON object.`;
            
            const response = await ai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: COURSE_OUTLINE_SCHEMA,
                },
            });
            responseText = response.text;
        }
        
        const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const courseData = JSON.parse(cleanedText);
        
        if (!courseData.courseTitle || !courseData.lectures || !Array.isArray(courseData.lectures)) {
            throw new Error("AI returned invalid course structure. Missing title or lectures.");
        }
        
        return courseData as Course;

    } catch (error) {
        console.error("Error generating course outline:", error);
        let errorMessage = "Failed to generate course outline from AI.";
        if (error instanceof Error) {
            if (error.message.includes('JSON') || error instanceof SyntaxError) {
                errorMessage = "The AI returned a malformed response for the outline. Please try again.";
            } else {
                errorMessage = error.message;
            }
        }
        throw new Error(errorMessage);
    }
}

export async function generateLectureDetails(
    courseTitle: string,
    lectureTitle: string,
    lectureGoals: string,
    language: string
): Promise<Omit<Lecture, 'title' | 'goals'>> {
     try {
        const languageInstruction = `The entire output (duration, script, summary, quiz) MUST be in ${language}. For 'Hinglish', use a mix of Hindi and English, written in the Latin script.`;
        const prompt = `You are an expert instructional designer. You are writing one lecture for a course titled "${courseTitle}".
        
The specific lecture you are writing is titled "${lectureTitle}" and its learning goals are: "${lectureGoals}".

Your task is to generate the detailed content for this single lecture. You must provide:
- The estimated duration of this lecture as a string (e.g., "9 min", "11 min").
- A full, detailed script. The script MUST be long enough to match its estimated duration. Do NOT generate a short or placeholder script. It must be written in a simple, conversational, and spoken tone. Use short sentences, real-life examples, and natural pauses (e.g., "Now, let's think about this..."). Avoid jargon.
- A brief summary of the key takeaways.
- A mini-quiz with 3-5 simple questions as an array of strings.

${languageInstruction}

The output MUST be a single, valid JSON object that strictly adheres to the provided schema. Do not include any text or explanations outside the JSON object.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: LECTURE_DETAILS_SCHEMA,
            },
        });

        const cleanedText = response.text.trim();
        const details = JSON.parse(cleanedText);
        
        if (!details.script || !details.summary || !details.quiz) {
            throw new Error("AI returned invalid lecture details.");
        }

        return details;

    } catch (error) {
        console.error("Error generating lecture details:", error);
        let errorMessage = `Failed to generate details for "${lectureTitle}".`;
        if (error instanceof Error) {
            if (error.message.includes('JSON') || error instanceof SyntaxError) {
                errorMessage = `The AI returned a malformed response for "${lectureTitle}".`;
            } else {
                errorMessage = error.message;
            }
        }
        throw new Error(errorMessage);
    }
}


export async function generateLectureAudio(script: string, voice: string): Promise<string> {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ parts: [{ text: `Say with a ${voice === 'Puck' || voice === 'Charon' ? 'moderately energetic' : 'calm and clear'} tone: ${script}` }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voice },
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("Audio data not found in AI response.");
        }
        return base64Audio;
    } catch (error) {
        console.error("Error generating lecture audio:", error);
        throw new Error("Failed to generate audio. The AI service might be unavailable.");
    }
}

export async function startVideoGeneration(prompt: string): Promise<any> {
    try {
        // A new instance is created here to ensure the latest API key from the selection dialog is used.
        const aiWithVideoKey = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const operation = await aiWithVideoKey.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: `Create a short, engaging video based on the following script. Focus on simple, clear visuals that illustrate the key concepts. The video should be suitable for a mobile-first learning experience. Script: "${prompt}"`,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: '16:9',
            }
        });
        return operation;
    } catch (error) {
        console.error("Error starting video generation:", error);
        if (error instanceof Error && error.message.includes('Requested entity was not found')) {
            throw new Error("API key is invalid or lacks permissions. Please select a valid key.");
        }
        throw new Error("Failed to start video generation. Check your API key and billing status.");
    }
}

export async function getVideoOperationStatus(operation: any): Promise<any> {
    try {
        // A new instance is created here to ensure the latest API key from the selection dialog is used.
        const aiWithVideoKey = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const newOperation = await aiWithVideoKey.operations.getVideosOperation({ operation: operation });
        return newOperation;
    } catch (error) {
        console.error("Error getting video operation status:", error);
        if (error instanceof Error && error.message.includes('Requested entity was not found')) {
            throw new Error("API key is invalid or lacks permissions. Please select a valid key.");
        }
        throw new Error("Failed to get video generation status.");
    }
}

export async function improveScript(script: string): Promise<string> {
    try {
        const prompt = `You are a professional scriptwriter specializing in educational audio content.
Review the following script and improve it. Make it more conversational, engaging, and easier to understand for a general audience.
Use shorter sentences, natural pauses, and add storytelling elements where appropriate, without changing the core information.

Original Script:
---
${script}
---

Return ONLY the improved script as a raw text string, with no extra formatting, titles, or explanations.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        return response.text.trim();
    } catch (error) {
        console.error("Error improving script:", error);
        throw new Error("Failed to improve script with AI.");
    }
}