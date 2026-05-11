# Speech synthesis - Qwen - Alibaba Cloud Model Studio - Alibaba Cloud Documentation Center

**URL:** https://www.alibabacloud.com/help/en/model-studio/qwen-tts#section-request

---

Documentation
Alibaba Cloud Model Studio
User Guide (Models)
User Guide (Application)
API Reference (Models)
API Reference (Application)
Search for Help Content
Get started
Product introduction
Make your first API call to Qwen
Recommended models
Rate limits
Select region and service deployment scope
Billing
Free quota for new users
Model inference pricing
Training and deployment pricing
Savings plans
Bill query and cost management
Token Plan (Team Edition)
Overview
Quick start
Best practices
FAQ
Coding Plan
Inference
Text generation
Visual understanding
Image generation and editing
Video generation and editing
Speech synthesis
Real-time speech synthesis - CosyVoice
Real-time speech synthesis - Qwen
Speech synthesis - Qwen
Music generation
Speech-to-text
Speech-to-speech
Omni-modal
Embedding and rerank
Clients and developer tools
OpenClaw
Hermes Agent
Claude Code
OpenCode
Cursor
Codex
Qwen Code
Cherry Studio
Chatbox
Cline
Qoder
Lingma
Kilo CLI
Postman
Dify
More tools
Fine-tuning
Fine-tune Qwen
Fine-tune a Wan video generation model
Deployment
Overview
Statistics and monitoring
Model usage
Model monitoring
Security and compliance
Permission management
Transmission security
Security certifications and privacy
Training data summary
Best Practices
Text-to-text prompt guide
Text-to-image prompt guide
Text-to-video/image-to-video prompt guide
Best practices for handling rate limiting
Support
FAQ
Related agreements
Changelog
Model lifecycle and updates
Announcements
Home Page
Alibaba Cloud Model Studio
User Guide (Models)
Inference
Speech synthesis
Speech synthesis - Qwen
Speech synthesis - Qwen
Updated at: 2026-03-31 08:02:12
Copy as MD
Product

Qwen speech synthesis delivers human-like voices with natural intonation and expressive delivery. It supports multiple languages and dialects, including Chinese dialects, and enables multilingual output using a single voice. The system automatically adapts tone and handles complex text smoothly.

Core features

Supports streaming output, enabling real-time audio synthesis and playback.

Supports multiple languages and dialects, including Chinese dialects.

Provides a wide range of voices to suit diverse use cases.

Offers two voice customization methods: voice cloning and voice design.

Supports instruction control, which lets you adjust speech expressiveness using natural language instructions.

Applicability

Available models:

InternationalChinese mainland

In international deployment mode, the endpoint and data storage are in the Singapore region. Model inference computing resources are dynamically scheduled worldwide, excluding the Chinese mainland.

When you call the following models, select an API key for the Singapore region:

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash (stable version, currently equivalent to qwen3-tts-instruct-flash-2026-01-26), qwen3-tts-instruct-flash-2026-01-26 (latest snapshot version)

Qwen3-TTS-VD: qwen3-tts-vd-2026-01-26 (latest snapshot version)

Qwen3-TTS-VC: qwen3-tts-vc-2026-01-22 (latest snapshot version)

Qwen3-TTS-Flash: qwen3-tts-flash (stable version, currently equivalent to qwen3-tts-flash-2025-11-27), qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18

See Model list.

Choose a model

Scenario

	

Recommended model

	

Reason




Custom voice for branding, exclusive voices, or extended system voices (from a text description)

	

qwen3-tts-vd-2026-01-26

	

Supports voice design. Create a custom voice from a text description without an audio sample. Ideal for designing a brand voice from scratch.




Custom voice for branding, exclusive voices, or extended system voices (from an audio sample)

	

qwen3-tts-vc-2026-01-22

	

Supports voice cloning. Clone a voice from an audio sample to create a human-like brand voiceprint with high fidelity and consistency.




Emotional content production (audiobooks, radio dramas, game/animation dubbing)

	

qwen3-tts-instruct-flash

	

Supports instruction control. Use natural language descriptions to control pitch, speed, emotion, and character personality. Ideal for scenarios requiring rich expression and character creation.




Mobile navigation or notification announcements

	

qwen3-tts-flash

	

Simple and transparent per-character billing. Ideal for high-frequency calls with short text.




Online education courseware dubbing

	

qwen3-tts-flash

	

Supports multiple languages and dialects to meet regional teaching needs.




Batch audiobook production

	

qwen3-tts-flash

	

Cost-effective. A wide selection of voices enriches content expression.

See Model feature comparison.

Getting started

Preparations

Configure an API key and export it as an environment variable.

If you call the service using the DashScope SDK, install the latest SDK version. The DashScope Java SDK must be version 2.21.9 or later. The DashScope Python SDK must be version 1.24.6 or later.

Note

In the DashScope Python SDK, the SpeechSynthesizer interface has been unified into MultiModalConversation. Replace the interface name. All other parameters remain compatible.

Synthesize speech with a system voiceSynthesize speech with a cloned voiceUsing voice design timbre for speech synthesis

These examples synthesize speech with a system voice.

Non-streaming outputStreaming output

Retrieve the synthesized speech from the returned url. The URL remains valid for 24 hours.

PythonJavacURL
 
import os
import dashscope

# This is the URL for the Singapore region. If you use a model in the China (Beijing) region, change the URL to: https://dashscope.aliyuncs.com/api/v1
dashscope.base_http_api_url = 'https://dashscope-intl.aliyuncs.com/api/v1'

text = "Today is a wonderful day to build something people love!"
# How to use the SpeechSynthesizer interface: dashscope.audio.qwen_tts.SpeechSynthesizer.call(...)
response = dashscope.MultiModalConversation.call(
    # To use the instruction control feature, change the model to qwen3-tts-instruct-flash.
    model="qwen3-tts-flash",
    # The API keys for the Singapore and China (Beijing) regions are different. Get an API key: https://www.alibabacloud.com/help/en/model-studio/get-api-key
    # If you have not configured the environment variable, replace the following line with your Model Studio API key: api_key = "sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    text=text,
    voice="Cherry",
    language_type="English", # Match the language type to the text language for correct pronunciation and natural intonation.
    # To use the instruction control feature, uncomment the following lines and change the model to qwen3-tts-instruct-flash.
    # instructions='Speak at a relatively fast speed with a noticeable rising intonation, suitable for introducing fashion products.',
    # optimize_instructions=True,
    stream=False
)
print(response)
Instruction control

Instruction control adjusts speech expressiveness through natural language descriptions. Adjust pitch, speed, emotion, and timbre without manually tuning audio parameters.

Supported models: Qwen3-TTS-Instruct-Flash series only.

Usage: Set the instructions parameter, for example, "Speak at a relatively fast speed with a noticeable rising intonation, suitable for introducing fashion products."

Supported languages: Instruction text supports only Chinese and English.

Length limit: 1,600 tokens maximum.

Scenarios:

Audiobook and radio drama dubbing

Advertising and promotional video dubbing

Game character and animation dubbing

Emotional intelligent voice assistants

Documentary and news broadcasting

How to write high-quality voice descriptions:

Core principles:

Be specific, not vague: Use words that describe concrete voice characteristics, such as "deep," "crisp," or "fast-paced." Avoid subjective and uninformative terms such as "nice" or "normal."

Be multi-dimensional, not single-dimensional: A good description combines multiple dimensions, such as pitch, speed, and emotion. A single-dimensional description, such as only "high-pitched," is too broad to generate a distinctive effect.

Be objective, not subjective: Focus on the physical and perceptual characteristics of the sound itself, not personal preferences. For example, use "high-pitched and energetic" instead of "my favorite sound."

Be original, not imitative: Describe voice characteristics rather than requesting imitation of a specific person, such as a celebrity or actor. Such requests involve copyright risks and are not supported.

Be concise, not redundant: Ensure every word adds meaning. Avoid repeating synonyms or meaningless intensifiers, such as "a very, very good voice."

Dimension reference: Combine multiple dimensions for richer expression.

Dimension

	

Description example




Pitch

	

High, medium, low, high-pitched, low-pitched




Speed

	

Fast, medium, slow, fast-paced, slow-paced




Emotion

	

Cheerful, calm, gentle, serious, lively, composed, soothing




Characteristics

	

Magnetic, crisp, hoarse, mellow, sweet, deep, powerful




Usage

	

News broadcast, ad voice-over, audiobook, animation character, voice assistant, documentary narration

Examples:

Standard broadcast style: Clear and precise articulation, well-rounded pronunciation.

Progressive emotional effect: Volume rapidly increases from normal conversation to a shout, with a straightforward personality and easily excited, expressive emotions.

Special emotional state: A sobbing tone causes slightly slurred and hoarse pronunciation, with noticeable tension in the crying voice.

Ad voice-over style: High-pitched, medium speed, full of energy and appeal, suitable for ad voice-overs.

Gentle and soothing style: Slow-paced, with a gentle and sweet pitch, and a soothing, warm tone, like a caring friend.

API reference

Speech synthesis - Qwen API reference

Voice cloning - API reference

Voice design - API reference

Model feature comparison

Features

	

Qwen3-TTS-Instruct-Flash

	

Qwen3-TTS-VD

	

Qwen3-TTS-VC

	

Qwen3-TTS-Flash

	

Qwen-TTS




Supported languages

	

Varies by voice: Chinese (Mandarin), English, Spanish, Russian, Italian, French, Korean, Japanese, German, Portuguese

	

Chinese (Mandarin), English, Spanish, Russian, Italian, French, Korean, Japanese, German, Portuguese

	

Varies by voice: Chinese (Mandarin, Shanghainese, Beijing dialect, Sichuan dialect, Nanjing dialect, Shaanxi dialect, Southern Min, Tianjin dialect), Cantonese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Varies by voice: Chinese (Mandarin, Shanghainese, Beijing dialect, Sichuan dialect), English




Audio format

	

wav: for non-streaming output

pcm: for streaming output, Base64-encoded




Audio sample rate

	

24 kHz




Voice cloning

	

Not supported

	

Supported

	

Not supported




Voice design

	

No

	

Supported

	

No




SSML

	

No




LaTeX

	

No




Volume control

	

Supported

Adjustable via instruction control
	

Not supported




Speech rate control

	

Supported

Adjustable via instruction control
	

Not supported




Pitch control

	

Supported

Adjustable via instruction control
	

No




Bitrate control

	

No




Timestamp

	

No




Instruction control

	

Supported

	

No




Streaming input

	

Not supported




Streaming output

	

Supported




Rate limiting

	

Requests per minute (RPM): 180

	

RPM: 180

	

RPM: 180

	

RPM varies by model:

qwen3-tts-flash, qwen3-tts-flash-2025-11-27: 180

qwen3-tts-flash-2025-09-18: 10

	

RPM: 10

Tokens per minute (TPM), including input and output tokens: 100,000




Connection type

	

Java/Python SDK, WebSocket API




Pricing

	

International: $0.115/10,000 characters

Chinese mainland: $0.115/10,000 characters

	

International: $0.115/10,000 characters

Chinese mainland: $0.115/10,000 characters

	

International: $0.115/10,000 characters

Chinese mainland: $0.115/10,000 characters

	

International: $0.1/10,000 characters

Chinese mainland: $0.114682/10,000 characters

	

Chinese mainland:

Input cost: $0.230/1,000 tokens

Output cost: $1.434/1,000 tokens

Token conversion: 1 second of audio equals 50 tokens. Audio shorter than 1 second counts as 50 tokens.

Supported system voices

Supported voices vary by model. Set the voice request parameter to the corresponding value in the voice parameter column of the voice list.

voice parameter

	

Details

	

Supported languages

	

Supported models




Cherry

	

Voice name: Cherry

Description: A sunny, positive, friendly, and natural young woman (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18

Qwen-TTS: qwen-tts, qwen-tts-2025-04-10, qwen-tts-latest, qwen-tts-2025-05-22




Serena

	

Voice name: Serena

Description: A gentle young woman (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27

Qwen-TTS: qwen-tts, qwen-tts-2025-04-10, qwen-tts-latest, qwen-tts-2025-05-22




Ethan

	

Voice name: Ethan

Description: Standard Mandarin with a slight northern accent. Sunny, warm, energetic, and vibrant (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18

Qwen-TTS: qwen-tts, qwen-tts-2025-04-10, qwen-tts-latest, qwen-tts-2025-05-22




Chelsie

	

Voice name: Chelsie

Description: A two-dimensional virtual girlfriend (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27

Qwen-TTS: qwen-tts, qwen-tts-2025-04-10, qwen-tts-latest, qwen-tts-2025-05-22




Momo

	

Voice name: Momo

Description: Playful and mischievous, cheering you up (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Vivian

	

Voice name: Vivian

Description: Confident, cute, and slightly feisty (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Moon

	

Voice name: Moon

Description: A bold and handsome man named Yuebai (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Maia

	

Voice name: Maia

Description: A blend of intellect and gentleness (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Kai

	

Voice name: Kai

Description: A soothing audio spa for your ears (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Nofish

	

Voice name: Nofish

Description: A designer who cannot pronounce retroflex sounds (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18




Bella

	

Voice name: Bella

Description: A little girl who drinks but never throws punches when drunk (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Jennifer

	

Voice name: Jennifer

Description: A premium, cinematic-quality American English female voice (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18




Ryan

	

Voice name: Ryan

Description: Full of rhythm, bursting with dramatic flair, balancing authenticity and tension (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18




Katerina

	

Voice name: Katerina

Description: A mature-woman voice with rich, memorable rhythm (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18




Aiden

	

Voice name: Aiden

Description: An American English young man skilled in cooking (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Eldric Sage

	

Voice name: Eldric Sage

Description: A calm and wise elder—weathered like a pine tree, yet clear-minded as a mirror (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Mia

	

Voice name: Mia

Description: Gentle as spring water, obedient as fresh snow (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Mochi

	

Voice name: Mochi

Description: A clever, quick-witted young adult—childlike innocence remains, yet wisdom shines through (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Bellona

	

Voice name: Bellona

Description: A powerful, clear voice that brings characters to life—so stirring it makes your blood boil. With heroic grandeur and perfect diction, this voice captures the full spectrum of human expression.

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Vincent

	

Voice name: Vincent

Description: A uniquely raspy, smoky voice—just one line evokes armies and heroic tales (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Bunny

	

Voice name: Bunny

Description: A little girl overflowing with "cuteness" (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Neil

	

Voice name: Neil

Description: A flat baseline intonation with precise, clear pronunciation—the most professional news anchor (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Elias

	

Voice name: Elias

Description: Maintains academic rigor while using storytelling techniques to turn complex knowledge into digestible learning modules (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18




Arthur

	

Voice name: Arthur

Description: A simple, earthy voice steeped in time and tobacco smoke—slowly unfolding village stories and curiosities (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Nini

	

Voice name: Nini

Description: A soft, clingy voice like sweet rice cakes—those drawn-out calls of “Big Brother” are so sweet they melt your bones (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Seren

	

Voice name: Seren

Description: A gentle, soothing voice to help you fall asleep faster. Good night, sweet dreams (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Pip

	

Voice name: Pip

Description: A playful, mischievous boy full of childlike wonder—is this your memory of Shin-chan? (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Stella

	

Voice name: Stella

Description: Normally a cloyingly sweet, dazed teenage-girl voice—but when shouting “I represent the moon to defeat you!”, she instantly radiates unwavering love and justice (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Instruct-Flash: qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Bodega

	

Voice name: Bodega

Description: A passionate Spanish man (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Sonrisa

	

Voice name: Sonisa

Description: A cheerful, outgoing Latin American woman (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Alek

	

Voice name: Alek

Description: Cold like the Russian spirit, yet warm like wool coat lining (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Dolce

	

Voice name: Dolce

Description: A laid-back Italian man (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Sohee

	

Voice name: Sohee

Description: A warm, cheerful, emotionally expressive Korean unnie (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Ono Anna

	

Voice name: Ono Anna

Description: A clever, spirited childhood friend (female)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Lenn

	

Voice name: Lenn

Description: Rational at heart, rebellious in detail—a German youth who wears suits and listens to post-punk

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Emilien

	

Voice name: Emilien

Description: A romantic French big brother (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Andre

	

Voice name: Andre

Description: A magnetic, natural, and steady male voice

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Radio Gol

	

Voice name: Radio Gol

Description: Football poet Radio Gol! Today I’ll commentate on football using my name (male)

	

Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27




Jada

	

Voice name: Shanghai - Jada

Description: A fast-paced, energetic Shanghai auntie (female)

	

Shanghainese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18

Qwen-TTS: qwen-tts-latest, qwen-tts-2025-05-22




Dylan

	

Voice name: Beijing - Dylan

Description: A young man raised in Beijing’s hutongs (male)

	

Beijing dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18

Qwen-TTS: qwen-tts-latest, qwen-tts-2025-05-22




Li

	

Voice name: Nanjing - Li

Description: A patient yoga teacher (male)

	

Nanjing dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18




Marcus

	

Voice name: Shaanxi - Marcus

Description: Broad face, few words, sincere heart, deep voice—the authentic Shaanxi flavor (male)

	

Shaanxi dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18




Roy

	

Voice name: Southern Min - Roy

Description: A humorous, straightforward, lively Taiwanese guy (male)

	

Southern Min, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18




Peter

	

Voice name: Tianjin - Peter

Description: Tianjin-style crosstalk, professional foil (male)

	

Tianjin dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, and qwen3-tts-flash-2025-09-18




Sunny

	

Voice name: Sichuan - Sunny

Description: A Sichuan girl sweet enough to melt your heart (female)

	

Sichuan dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18

Qwen-TTS: qwen-tts-latest, qwen-tts-2025-05-22




Eric

	

Voice name: Sichuan - Eric

Description: A Sichuanese man from Chengdu who stands out in everyday life (male)

	

Sichuan dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18




Rocky

	

Voice name: Cantonese - Rocky

Description: A humorous, witty A Qiang providing live chat (male)

	

Cantonese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, and qwen3-tts-flash-2025-09-18




Kiki

	

Voice name: Cantonese - Kiki

Description: A sweet Hong Kong girl best friend (female)

	

Cantonese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean

	

Qwen3-TTS-Flash: qwen3-tts-flash, qwen3-tts-flash-2025-11-27, and qwen3-tts-flash-2025-09-18

FAQ
Q: How long is the audio file URL valid?

A: The audio file URL expires after 24 hours.

Previous: Real-time speech synthesis - Qwen
Next: Music generation
Is this page helpful?
Feedback
On this page （1）
Core features
Applicability
Choose a model
Getting started
Instruction control
API reference
Model feature comparison
Supported system voices
FAQ
	Q: How long is the audio file URL valid?

Chat now with Alibaba Cloud Customer Service to assist you in finding the right products and services to meet your needs.

WHY ALIBABA CLOUD

About Alibaba Cloud
Asia Accelerator
Our Global Network
Global Offices
Trust Center
Case Studies
Analyst Reports

PRODUCTS & PRICINGS

Pricing Calculator
ECS
SAS
Model Studio
Database
Security
SMS

SOLUTIONS

Financial Services
Retail Services
Media Services
Gaming Services
ISV Solutions

ENGAGE

Developer Community
Partner Network
Startups
Marketplace
Join Alibaba Cloud

RESOURCES & SUPPORT

Developer Learning Hub
Documentation Center
Training & Certification
Service Notices
Submit a Ticket
Security Report
Qwen Cloud
   
© 2009-2026 Copyright by Alibaba Cloud All rights reserved
Careers
About Us
Privacy Policy
Legal
Integrity Compliance Reporting Channel
Service Notices
Links