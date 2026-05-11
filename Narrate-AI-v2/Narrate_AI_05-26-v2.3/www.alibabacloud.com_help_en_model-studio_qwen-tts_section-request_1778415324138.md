Document Center

All Products

Search

* Document Center
* Alibaba Cloud Model Studio
* User Guide (Models)")
* Inference
* Speech synthesis
* Speech synthesis - Qwen

all-products-head

This Product

Alibaba Cloud Model Studio:Speech synthesis - Qwen

Document Center

# Alibaba Cloud Model Studio:Speech synthesis - Qwen

Last Updated:Mar 31, 2026

Qwen speech synthesis delivers human-like voices with natural intonation and expressive delivery. It supports multiple languages and dialects, including Chinese dialects, and enables multilingual output using a single voice. The system automatically adapts tone and handles complex text smoothly.

## **Core features**

* Supports streaming output, enabling real-time audio synthesis and playback.
* Supports multiple languages and dialects, including Chinese dialects.
* Provides a wide range of voices to suit diverse use cases.
* Offers two voice customization methods: voice cloning and voice design .
* Supports instruction control , which lets you adjust speech expressiveness using natural language instructions.

## **Applicability**

**Available models:**

## International

In international deployment mode , the endpoint and data storage are in the **Singapore region** . Model inference computing resources are dynamically scheduled worldwide, excluding the Chinese mainland.

When you call the following models, select an [API key](https://modelstudio.console.alibabacloud.com/?tab=dashboard#/api-key) for the Singapore region:

* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash (stable version, currently equivalent to qwen3-tts-instruct-flash-2026-01-26), qwen3-tts-instruct-flash-2026-01-26 (latest snapshot version)
* **Qwen3-TTS-VD** : qwen3-tts-vd-2026-01-26 (latest snapshot version)
* **Qwen3-TTS-VC** : qwen3-tts-vc-2026-01-22 (latest snapshot version)
* **Qwen3-TTS-Flash** : qwen3-tts-flash (stable version, currently equivalent to qwen3-tts-flash-2025-11-27), qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18

## Chinese mainland

In Chinese mainland deployment mode , the endpoint and data storage are in the **Beijing region** . Model inference computing resources are limited to the Chinese mainland.

When you call the following models, select an [API key](https://bailian.console.alibabacloud.com/?tab=model#/api-key) for the Beijing region:

* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash (stable version, currently equivalent to qwen3-tts-instruct-flash-2026-01-26), qwen3-tts-instruct-flash-2026-01-26 (latest snapshot version)
* **Qwen3-TTS-VD** : qwen3-tts-vd-2026-01-26 (latest snapshot version)
* **Qwen3-TTS-VC** : qwen3-tts-vc-2026-01-22 (latest snapshot version)
* **Qwen3-TTS-Flash** : qwen3-tts-flash (stable version, currently equivalent to qwen3-tts-flash-2025-11-27), qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18
* **Qwen-TTS** : qwen-tts (stable version, currently equivalent to qwen-tts-2025-04-10), qwen-tts-latest (latest version, currently equivalent to qwen-tts-2025-05-22), qwen-tts-2025-05-22 (snapshot version), qwen-tts-2025-04-10 (snapshot version)

See Model list .

## **Choose a model**

|**Scenario** |**Recommended model** |**Reason** |
| --- | --- | --- |
|**Custom voice for branding, exclusive voices, or extended system voices (from a text description)** |qwen3-tts-vd-2026-01-26 |Supports voice design. Create a custom voice from a text description without an audio sample. Ideal for designing a brand voice from scratch. |
|**Custom voice for branding, exclusive voices, or extended system voices (from an audio sample)** |qwen3-tts-vc-2026-01-22 |Supports voice cloning. Clone a voice from an audio sample to create a human-like brand voiceprint with high fidelity and consistency. |
|**Emotional content production (audiobooks, radio dramas, game/animation dubbing)** |qwen3-tts-instruct-flash |Supports instruction control. Use natural language descriptions to control pitch, speed, emotion, and character personality. Ideal for scenarios requiring rich expression and character creation. |
|**Mobile navigation or notification announcements** |qwen3-tts-flash |Simple and transparent per-character billing. Ideal for high-frequency calls with short text. |
|**Online education courseware dubbing** |qwen3-tts-flash |Supports multiple languages and dialects to meet regional teaching needs. |
|**Batch audiobook production** |qwen3-tts-flash |Cost-effective. A wide selection of voices enriches content expression. |

See Model feature comparison .

## **Getting started**

**Preparations**

* Configure an API key and export it as an environment variable .
* If you call the service using the DashScope SDK, install the latest SDK version . The DashScope Java SDK must be version 2.21.9 or later. The DashScope Python SDK must be version 1.24.6 or later.
  
  **Note**
  
  In the DashScope Python SDK, the `SpeechSynthesizer` interface has been unified into `MultiModalConversation` . Replace the interface name. All other parameters remain compatible.

## Synthesize speech with a system voice

These examples synthesize speech with a system voice .

## Non-streaming output

Retrieve the synthesized speech from the returned `url` . The URL remains valid for 24 hours.

## Python

```
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
```

## Java

You need to import the Gson dependency. If you use Maven or Gradle, add the dependency as follows:

### Maven

Add the following content to `pom.xml` :

```
<!-- https://mvnrepository.com/artifact/com.google.code.gson/gson -->
<dependency>
    <groupId>com.google.code.gson</groupId>
    <artifactId>gson</artifactId>
    <version>2.13.1</version>
</dependency>
```

### Gradle

Add the following content to `build.gradle` :

```
// https://mvnrepository.com/artifact/com.google.code.gson/gson
implementation("com.google.code.gson:gson:2.13.1")
```

```
import com.alibaba.dashscope.aigc.multimodalconversation.AudioParameters;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.protocol.Protocol;
import com.alibaba.dashscope.utils.Constants;

import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URL;

public class Main {
    // To use the instruction control feature, change MODEL to qwen3-tts-instruct-flash.
    private static final String MODEL = "qwen3-tts-flash";
    public static void call() throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // The API keys for the Singapore and China (Beijing) regions are different. Get an API key: https://www.alibabacloud.com/help/en/model-studio/get-api-key
                // If you have not configured the environment variable, replace the following line with your Model Studio API key: .apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model(MODEL)
                .text("Today is a wonderful day to build something people love!")
                .voice(AudioParameters.Voice.CHERRY)
                .languageType("English") // Match the language type to the text language for correct pronunciation and natural intonation.
                // To use the instruction control feature, uncomment the following lines and change the model to qwen3-tts-instruct-flash.
                // .parameter("instructions","Speak at a relatively fast speed with a noticeable rising intonation, suitable for introducing fashion products.")
                // .parameter("optimize_instructions",true)
                .build();
        MultiModalConversationResult result = conv.call(param);
        String audioUrl = result.getOutput().getAudio().getUrl();
        System.out.print(audioUrl);

        // Download the audio file to your local machine.
        try (InputStream in = new URL(audioUrl).openStream();
             FileOutputStream out = new FileOutputStream("downloaded_audio.wav")) {
            byte[] buffer = new byte[1024];
            int bytesRead;
            while ((bytesRead = in.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
            }
            System.out.println("\nAudio file downloaded to: downloaded_audio.wav");
        } catch (Exception e) {
            System.out.println("\nError downloading audio file: " + e.getMessage());
        }
    }
    public static void main(String[] args) {
        // This is the URL for the Singapore region. If you use a model in the China (Beijing) region, change the URL to: https://dashscope.aliyuncs.com/api/v1
        Constants.baseHttpApiUrl = "https://dashscope-intl.aliyuncs.com/api/v1";
        try {
            call();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

## cURL

```
# ======= Important =======
# This is the URL for the Singapore region. If you use a model in the China (Beijing) region, change the URL to: https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# The API keys for the Singapore and China (Beijing) regions are different. Get an API key: https://www.alibabacloud.com/help/en/model-studio/get-api-key
# === Delete this comment before execution ===

curl -X POST 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
    "model": "qwen3-tts-flash",
    "input": {
        "text": "Today is a wonderful day to build something people love!",
        "voice": "Cherry",
        "language_type": "English"
    }
}'
```

## Streaming output

Audio data is streamed in Base64 format. The final data packet contains the URL of the complete audio file.

## Python

```
# coding=utf-8
#
# Installation instructions for pyaudio:
# APPLE Mac OS X
#   brew install portaudio
#   pip install pyaudio
# Debian/Ubuntu
#   sudo apt-get install python-pyaudio python3-pyaudio
#   or
#   pip install pyaudio
# CentOS
#   sudo yum install -y portaudio portaudio-devel && pip install pyaudio
# Microsoft Windows
#   python -m pip install pyaudio

import os
import dashscope
import pyaudio
import time
import base64
import numpy as np

# This is the URL for the Singapore region. If you use a model in the China (Beijing) region, change the URL to: https://dashscope.aliyuncs.com/api/v1
dashscope.base_http_api_url = 'https://dashscope-intl.aliyuncs.com/api/v1'

p = pyaudio.PyAudio()
# Create an audio stream.
stream = p.open(format=pyaudio.paInt16,
                channels=1,
                rate=24000,
                output=True)

text = "Today is a wonderful day to build something people love!"
response = dashscope.MultiModalConversation.call(
    # The API keys for the Singapore and China (Beijing) regions are different. Get an API key: https://www.alibabacloud.com/help/en/model-studio/get-api-key
    # If you have not configured the environment variable, replace the following line with your Model Studio API key: api_key = "sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    # To use the instruction control feature, change the model to qwen3-tts-instruct-flash.
    model="qwen3-tts-flash",
    text=text,
    voice="Cherry",
    language_type="English", # Match the language type to the text language for correct pronunciation and natural intonation.
    # To use the instruction control feature, uncomment the following lines and change the model to qwen3-tts-instruct-flash.
    # instructions='Speak at a relatively fast speed with a noticeable rising intonation, suitable for introducing fashion products.',
    # optimize_instructions=True,
    stream=True
)

for chunk in response:
    if chunk.output is not None:
      audio = chunk.output.audio
      if audio.data is not None:
          wav_bytes = base64.b64decode(audio.data)
          audio_np = np.frombuffer(wav_bytes, dtype=np.int16)
          # Play the audio data directly.
          stream.write(audio_np.tobytes())
      if chunk.output.finish_reason == "stop":
          print("finish at: {} ", chunk.output.audio.expires_at)
time.sleep(0.8)
# Clean up resources.
stream.stop_stream()
stream.close()
p.terminate()
```

## Java

You need to import the Gson dependency. If you use Maven or Gradle, add the dependency as follows:

### Maven

Add the following content to `pom.xml` :

```
<!-- https://mvnrepository.com/artifact/com.google.code.gson/gson -->
<dependency>
    <groupId>com.google.code.gson</groupId>
    <artifactId>gson</artifactId>
    <version>2.13.1</version>
</dependency>
```

### Gradle

Add the following content to `build.gradle` :

```
// https://mvnrepository.com/artifact/com.google.code.gson/gson
implementation("com.google.code.gson:gson:2.13.1")
```

```
// Install the latest version of the DashScope SDK.
import com.alibaba.dashscope.aigc.multimodalconversation.AudioParameters;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.protocol.Protocol;
import com.alibaba.dashscope.utils.Constants;
import io.reactivex.Flowable;
import javax.sound.sampled.*;
import java.util.Base64;

public class Main {
    // To use the instruction control feature, change MODEL to qwen3-tts-instruct-flash.
    private static final String MODEL = "qwen3-tts-flash";
    public static void streamCall() throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // The API keys for the Singapore and China (Beijing) regions are different. Get an API key: https://www.alibabacloud.com/help/en/model-studio/get-api-key
                // If you have not configured the environment variable, replace the following line with your Model Studio API key: .apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model(MODEL)
                .text("Today is a wonderful day to build something people love!")
                .voice(AudioParameters.Voice.CHERRY)
                .languageType("English") // Match the language type to the text language for correct pronunciation and natural intonation.
                // To use the instruction control feature, uncomment the following lines and change the model to qwen3-tts-instruct-flash.
                // .parameter("instructions","Speak at a relatively fast speed with a noticeable rising intonation, suitable for introducing fashion products.")
                // .parameter("optimize_instructions",true)
                .build();
        Flowable<MultiModalConversationResult> result = conv.streamCall(param);
        result.blockingForEach(r -> {
            try {
                // 1. Get the Base64-encoded audio data.
                String base64Data = r.getOutput().getAudio().getData();
                byte[] audioBytes = Base64.getDecoder().decode(base64Data);

                // 2. Configure the audio format. Adjust the format based on the API response.
                AudioFormat format = new AudioFormat(
                        AudioFormat.Encoding.PCM_SIGNED,
                        24000, // Sample rate. This must be consistent with the format returned by the API.
                        16,    // Audio bit depth
                        1,     // The number of sound channels
                        2,     // Frame size (bit depth/8)
                        24000, // Data transmission rate. This must be consistent with the sample rate.
                        false  // Specifies whether the data is compressed.
                );

                // 3. Play the audio data in real time.
                DataLine.Info info = new DataLine.Info(SourceDataLine.class, format);
                try (SourceDataLine line = (SourceDataLine) AudioSystem.getLine(info)) {
                    if (line != null) {
                        line.open(format);
                        line.start();
                        line.write(audioBytes, 0, audioBytes.length);
                        line.drain();
                    }
                }
            } catch (LineUnavailableException e) {
                e.printStackTrace();
            }
        });
    }
    public static void main(String[] args) {
        // This is the URL for the Singapore region. If you use a model in the China (Beijing) region, change the URL to: https://dashscope.aliyuncs.com/api/v1
        Constants.baseHttpApiUrl = "https://dashscope-intl.aliyuncs.com/api/v1";
        try {
            streamCall();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

## cURL

```
# ======= Important =======
# This is the URL for the Singapore region. If you use a model in the China (Beijing) region, change the URL to: https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# The API keys for the Singapore and China (Beijing) regions are different. Get an API key: https://www.alibabacloud.com/help/en/model-studio/get-api-key
# === Delete this comment before execution ===

curl -X POST 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H 'Content-Type: application/json' \
-H 'X-DashScope-SSE: enable' \
-d '{
    "model": "qwen3-tts-flash",
    "input": {
        "text": "Today is a wonderful day to build something people love!",
        "voice": "Cherry",
        "language_type": "Chinese"
    }
}'
```

## Synthesize speech with a cloned voice

Voice cloning does not provide preview audio. To evaluate the result, apply the cloned voice to speech synthesis.

This example uses a cloned voice for speech synthesis, producing output closely matching the original voice. It builds on the non-streaming output sample for the DashScope SDK, with the `voice` parameter set to the cloned voice.

* **Key principle** : The model used for voice cloning ( `target_model` ) must match the model used for speech synthesis ( `model` ). Otherwise, synthesis fails.
* The example uses the local audio file `voice.mp3` for voice cloning. When you run the code, replace the file path with your own.

### Python

```
import os
import requests
import base64
import pathlib
import dashscope

# ======= Constant configuration =======
DEFAULT_TARGET_MODEL = "qwen3-tts-vc-2026-01-22"  # Use the same model for voice cloning and speech synthesis
DEFAULT_PREFERRED_NAME = "guanyu"
DEFAULT_AUDIO_MIME_TYPE = "audio/mpeg"
VOICE_FILE_PATH = "voice.mp3"  # Relative path to the local audio file used for voice cloning

def create_voice(file_path: str,
                 target_model: str = DEFAULT_TARGET_MODEL,
                 preferred_name: str = DEFAULT_PREFERRED_NAME,
                 audio_mime_type: str = DEFAULT_AUDIO_MIME_TYPE) -> str:
    """
    Create a voice and return the voice parameter.
    """
    # If you haven't configured an environment variable, replace the following line with: api_key = "sk-xxx"
    api_key = os.getenv("DASHSCOPE_API_KEY")

    file_path_obj = pathlib.Path(file_path)
    if not file_path_obj.exists():
        raise FileNotFoundError(f"Audio file does not exist: {file_path}")

    base64_str = base64.b64encode(file_path_obj.read_bytes()).decode()
    data_uri = f"data:{audio_mime_type};base64,{base64_str}"

    # Singapore region endpoint. For the Beijing region, use: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization
    url = "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization"
    payload = {
        "model": "qwen-voice-enrollment", # Do not change this value
        "input": {
            "action": "create",
            "target_model": target_model,
            "preferred_name": preferred_name,
            "audio": {"data": data_uri}
        }
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    resp = requests.post(url, json=payload, headers=headers)
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to create voice: {resp.status_code}, {resp.text}")

    try:
        return resp.json()["output"]["voice"]
    except (KeyError, ValueError) as e:
        raise RuntimeError(f"Failed to parse voice response: {e}")

if __name__ == '__main__':
    # Singapore region endpoint. For the Beijing region, use: https://dashscope.aliyuncs.com/api/v1
    dashscope.base_http_api_url = 'https://dashscope-intl.aliyuncs.com/api/v1'

    text = "How's the weather today?"
    # SpeechSynthesizer interface usage: dashscope.audio.qwen_tts.SpeechSynthesizer.call(...)
    response = dashscope.MultiModalConversation.call(
        model=DEFAULT_TARGET_MODEL,
        # If you haven't configured an environment variable, replace the following line with: api_key = "sk-xxx"
        api_key=os.getenv("DASHSCOPE_API_KEY"),
        text=text,
        voice=create_voice(VOICE_FILE_PATH), # Replace the voice parameter with the custom voice generated by cloning
        stream=False
    )
    print(response)
```

### Java

Add the Gson dependency to your project.

#### Maven

Add the following content to `pom.xml` :

```
<!-- https://mvnrepository.com/artifact/com.google.code.gson/gson -->
<dependency>
    <groupId>com.google.code.gson</groupId>
    <artifactId>gson</artifactId>
    <version>2.13.1</version>
</dependency>
```

#### Gradle

Add the following content to `build.gradle` :

```
// https://mvnrepository.com/artifact/com.google.code.gson/gson
implementation("com.google.code.gson:gson:2.13.1")
```

**Important**

When you use speech synthesis with a custom voice generated by voice cloning, configure the voice as follows:

```
MultiModalConversationParam param = MultiModalConversationParam.builder()
                .parameter("voice", "your_voice") // Replace the voice parameter with the custom voice generated by cloning
                .build();
```

```
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.utils.Constants;
import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class Main {
    // ===== Constant definitions =====
    // Use the same model for voice cloning and speech synthesis
    private static final String TARGET_MODEL = "qwen3-tts-vc-2026-01-22";
    private static final String PREFERRED_NAME = "guanyu";
    // Relative path to the local audio file used for voice cloning
    private static final String AUDIO_FILE = "voice.mp3";
    private static final String AUDIO_MIME_TYPE = "audio/mpeg";

    // Generate a data URI
    public static String toDataUrl(String filePath) throws IOException {
        byte[] bytes = Files.readAllBytes(Paths.get(filePath));
        String encoded = Base64.getEncoder().encodeToString(bytes);
        return "data:" + AUDIO_MIME_TYPE + ";base64," + encoded;
    }

    // Call the API to create a voice
    public static String createVoice() throws Exception {
        // API keys differ between the Singapore and Beijing regions. To obtain an API key, see https://www.alibabacloud.com/help/zh/model-studio/get-api-key
        // If you haven't configured an environment variable, replace the following line with: String apiKey = "sk-xxx"
        String apiKey = System.getenv("DASHSCOPE_API_KEY");

        String jsonPayload =
                "{"
                        + "\"model\": \"qwen-voice-enrollment\"," // Do not change this value
                        + "\"input\": {"
                        +     "\"action\": \"create\","
                        +     "\"target_model\": \"" + TARGET_MODEL + "\","
                        +     "\"preferred_name\": \"" + PREFERRED_NAME + "\","
                        +     "\"audio\": {"
                        +         "\"data\": \"" + toDataUrl(AUDIO_FILE) + "\""
                        +     "}"
                        + "}"
                        + "}";

        // Singapore region endpoint. For the Beijing region, use: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization
        String url = "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization";
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setRequestMethod("POST");
        con.setRequestProperty("Authorization", "Bearer " + apiKey);
        con.setRequestProperty("Content-Type", "application/json");
        con.setDoOutput(true);

        try (OutputStream os = con.getOutputStream()) {
            os.write(jsonPayload.getBytes(StandardCharsets.UTF_8));
        }

        int status = con.getResponseCode();
        System.out.println("HTTP status code: " + status);

        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(status >= 200 && status < 300 ? con.getInputStream() : con.getErrorStream(),
                        StandardCharsets.UTF_8))) {
            StringBuilder response = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                response.append(line);
            }
            System.out.println("Response content: " + response);

            if (status == 200) {
                JsonObject jsonObj = new Gson().fromJson(response.toString(), JsonObject.class);
                return jsonObj.getAsJsonObject("output").get("voice").getAsString();
            }
            throw new IOException("Failed to create voice: " + status + " - " + response);
        }
    }

    public static void call() throws Exception {
        MultiModalConversation conv = new MultiModalConversation();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // API keys differ between the Singapore and Beijing regions. To obtain an API key, see https://www.alibabacloud.com/help/zh/model-studio/get-api-key
                // If you haven't configured an environment variable, replace the following line with: .apikey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model(TARGET_MODEL)
                .text("How's the weather today?")
                .parameter("voice", createVoice()) // Replace the voice parameter with the custom voice generated by cloning
                .build();
        MultiModalConversationResult result = conv.call(param);
        String audioUrl = result.getOutput().getAudio().getUrl();
        System.out.print(audioUrl);

        // Download the audio file locally
        try (InputStream in = new URL(audioUrl).openStream();
             FileOutputStream out = new FileOutputStream("downloaded_audio.wav")) {
            byte[] buffer = new byte[1024];
            int bytesRead;
            while ((bytesRead = in.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
            }
            System.out.println("\nAudio file downloaded locally: downloaded_audio.wav");
        } catch (Exception e) {
            System.out.println("\nError downloading audio file: " + e.getMessage());
        }
    }
    public static void main(String[] args) {
        try {
            // Singapore region endpoint. For the Beijing region, use: https://dashscope.aliyuncs.com/api/v1
            Constants.baseHttpApiUrl = "https://dashscope-intl.aliyuncs.com/api/v1";
            call();
        } catch (Exception e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

## Using voice design timbre for speech synthesis

The voice design feature returns preview audio. Listen to the preview to confirm it meets your expectations before using it for synthesis. This reduces call costs.

1. Create a custom voice and preview it. If satisfied, proceed. Otherwise, recreate.
   
   ### Python
   
   ```
   import requests
   import base64
   import os
   
   def create_voice_and_play():
       # API keys differ between Singapore and Beijing regions. Get an API key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key
       # If the environment variable is not set, replace the following line with your Model Studio API key: api_key = "sk-xxx"
       api_key = os.getenv("DASHSCOPE_API_KEY")
       
       if not api_key:
           print("Error: DASHSCOPE_API_KEY environment variable not found. Please set the API key first.")
           return None, None, None
       
       # Prepare request data
       headers = {
           "Authorization": f"Bearer {api_key}",
           "Content-Type": "application/json"
       }
       
       data = {
           "model": "qwen-voice-design",
           "input": {
               "action": "create",
               "target_model": "qwen3-tts-vd-2026-01-26",
               "voice_prompt": "A composed middle-aged male announcer with a deep, rich and magnetic voice, a steady speaking speed and clear articulation, is suitable for news broadcasting or documentary commentary.",
               "preview_text": "Dear listeners, hello everyone. Welcome to the evening news.",
               "preferred_name": "announcer",
               "language": "en"
           },
           "parameters": {
               "sample_rate": 24000,
               "response_format": "wav"
           }
       }
       
       # The following is the URL for the Singapore region. If you use a model in the Beijing region, replace the URL with: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization
       url = "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization"
       
       try:
           # Send the request
           response = requests.post(
               url,
               headers=headers,
               json=data,
               timeout=60  # Add a timeout setting
           )
           
           if response.status_code == 200:
               result = response.json()
               
               # Get the voice name
               voice_name = result["output"]["voice"]
               print(f"Voice name: {voice_name}")
               
               # Get the preview audio data
               base64_audio = result["output"]["preview_audio"]["data"]
               
               # Decode the Base64 audio data
               audio_bytes = base64.b64decode(base64_audio)
               
               # Save the audio file locally
               filename = f"{voice_name}_preview.wav"
               
               # Write the audio data to a local file
               with open(filename, 'wb') as f:
                   f.write(audio_bytes)
               
               print(f"Audio saved to local file: {filename}")
               print(f"File path: {os.path.abspath(filename)}")
               
               return voice_name, audio_bytes, filename
           else:
               print(f"Request failed with status code: {response.status_code}")
               print(f"Response content: {response.text}")
               return None, None, None
               
       except requests.exceptions.RequestException as e:
           print(f"A network request error occurred: {e}")
           return None, None, None
       except KeyError as e:
           print(f"Response data format error, missing required field: {e}")
           print(f"Response content: {response.text if 'response' in locals() else 'No response'}")
           return None, None, None
       except Exception as e:
           print(f"An unknown error occurred: {e}")
           return None, None, None
   
   if __name__ == "__main__":
       print("Starting to create voice...")
       voice_name, audio_data, saved_filename = create_voice_and_play()
       
       if voice_name:
           print(f"\nSuccessfully created voice '{voice_name}'")
           print(f"Audio file saved as: '{saved_filename}'")
           print(f"File size: {os.path.getsize(saved_filename)} bytes")
       else:
           print("\nVoice creation failed")
   ```
   
   ### Java
   
   Add the Gson dependency to your project:
   
   #### Maven
   
   Add the following to your `pom.xml` :
   
   ```
   <!-- https://mvnrepository.com/artifact/com.google.code.gson/gson -->
   <dependency>
       <groupId>com.google.code.gson</groupId>
       <artifactId>gson</artifactId>
       <version>2.13.1</version>
   </dependency>
   ```
   
   #### Gradle
   
   Add the following to your `build.gradle` :
   
   ```
   // https://mvnrepository.com/artifact/com.google.code.gson/gson
   implementation("com.google.code.gson:gson:2.13.1")
   ```
   
   **Important**
   
   To use a custom voice generated by voice design for speech synthesis, configure the voice as follows:
   
   ```
   MultiModalConversationParam param = MultiModalConversationParam.builder()
                   .parameter("voice", "your_voice") // Replace the voice parameter with the custom voice generated by voice design
                   .build();
   ```
   
   ```
   import com.google.gson.JsonObject;
   import com.google.gson.JsonParser;
   import java.io.*;
   import java.net.HttpURLConnection;
   import java.net.URL;
   import java.util.Base64;
   
   public class Main {
       public static void main(String[] args) {
           Main example = new Main();
           example.createVoice();
       }
   
       public void createVoice() {
           // API keys differ between Singapore and Beijing regions. Get an API key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key
           // If the environment variable is not set, replace the following line with your Model Studio API key: String apiKey = "sk-xxx"
           String apiKey = System.getenv("DASHSCOPE_API_KEY");
   
           // Create the JSON request body string
           String jsonBody = "{\n" +
                   "    \"model\": \"qwen-voice-design\",\n" +
                   "    \"input\": {\n" +
                   "        \"action\": \"create\",\n" +
                   "        \"target_model\": \"qwen3-tts-vd-2026-01-26\",\n" +
                   "        \"voice_prompt\": \"A composed middle-aged male announcer with a deep, rich and magnetic voice, a steady speaking speed and clear articulation, is suitable for news broadcasting or documentary commentary.\",\n" +
                   "        \"preview_text\": \"Dear listeners, hello everyone. Welcome to the evening news.\",\n" +
                   "        \"preferred_name\": \"announcer\",\n" +
                   "        \"language\": \"en\"\n" +
                   "    },\n" +
                   "    \"parameters\": {\n" +
                   "        \"sample_rate\": 24000,\n" +
                   "        \"response_format\": \"wav\"\n" +
                   "    }\n" +
                   "}";
   
           HttpURLConnection connection = null;
           try {
               // The following is the URL for the Singapore region. If you use a model in the Beijing region, replace the URL with: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization
               URL url = new URL("https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization");
               connection = (HttpURLConnection) url.openConnection();
   
               // Set the request method and headers
               connection.setRequestMethod("POST");
               connection.setRequestProperty("Authorization", "Bearer " + apiKey);
               connection.setRequestProperty("Content-Type", "application/json");
               connection.setDoOutput(true);
               connection.setDoInput(true);
   
               // Send the request body
               try (OutputStream os = connection.getOutputStream()) {
                   byte[] input = jsonBody.getBytes("UTF-8");
                   os.write(input, 0, input.length);
                   os.flush();
               }
   
               // Get the response
               int responseCode = connection.getResponseCode();
               if (responseCode == HttpURLConnection.HTTP_OK) {
                   // Read the response content
                   StringBuilder response = new StringBuilder();
                   try (BufferedReader br = new BufferedReader(
                           new InputStreamReader(connection.getInputStream(), "UTF-8"))) {
                       String responseLine;
                       while ((responseLine = br.readLine()) != null) {
                           response.append(responseLine.trim());
                       }
                   }
   
                   // Parse the JSON response
                   JsonObject jsonResponse = JsonParser.parseString(response.toString()).getAsJsonObject();
                   JsonObject outputObj = jsonResponse.getAsJsonObject("output");
                   JsonObject previewAudioObj = outputObj.getAsJsonObject("preview_audio");
   
                   // Get the voice name
                   String voiceName = outputObj.get("voice").getAsString();
                   System.out.println("Voice name: " + voiceName);
   
                   // Get the Base64-encoded audio data
                   String base64Audio = previewAudioObj.get("data").getAsString();
   
                   // Decode the Base64 audio data
                   byte[] audioBytes = Base64.getDecoder().decode(base64Audio);
   
                   // Save the audio to a local file
                   String filename = voiceName + "_preview.wav";
                   saveAudioToFile(audioBytes, filename);
   
                   System.out.println("Audio saved to local file: " + filename);
   
               } else {
                   // Read the error response
                   StringBuilder errorResponse = new StringBuilder();
                   try (BufferedReader br = new BufferedReader(
                           new InputStreamReader(connection.getErrorStream(), "UTF-8"))) {
                       String responseLine;
                       while ((responseLine = br.readLine()) != null) {
                           errorResponse.append(responseLine.trim());
                       }
                   }
   
                   System.out.println("Request failed with status code: " + responseCode);
                   System.out.println("Error response: " + errorResponse.toString());
               }
   
           } catch (Exception e) {
               System.err.println("An error occurred during the request: " + e.getMessage());
               e.printStackTrace();
           } finally {
               if (connection != null) {
                   connection.disconnect();
               }
           }
       }
   
       private void saveAudioToFile(byte[] audioBytes, String filename) {
           try {
               File file = new File(filename);
               try (FileOutputStream fos = new FileOutputStream(file)) {
                   fos.write(audioBytes);
               }
               System.out.println("Audio saved to: " + file.getAbsolutePath());
           } catch (IOException e) {
               System.err.println("An error occurred while saving the audio file: " + e.getMessage());
               e.printStackTrace();
           }
       }
   }
   ```
2. Use the custom voice created in the previous step for non-streaming speech synthesis.
   
   This example follows the "non-streaming output" sample code for system voices in the DashScope SDK. Replace the `voice` parameter with the custom voice generated by voice design. For unidirectional streaming synthesis, see Speech synthesis - Qwen .
   
   **Key principle** : The model used for voice design ( `target_model` ) must match the model used for subsequent speech synthesis ( `model` ). Otherwise, synthesis fails.
   
   ### Python
   
   ```
   import os
   import dashscope
   
   
   if __name__ == '__main__':
       # The following is the URL for the Singapore region. If you use a model in the Beijing region, replace the URL with: https://dashscope.aliyuncs.com/api/v1
       dashscope.base_http_api_url = 'https://dashscope-intl.aliyuncs.com/api/v1'
   
       text = "What's the weather like today?"
       # How to use SpeechSynthesizer: dashscope.audio.qwen_tts.SpeechSynthesizer.call(...)
       response = dashscope.MultiModalConversation.call(
           model="qwen3-tts-vd-2026-01-26",
           # API keys differ between Singapore and Beijing regions. Get an API key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key
           # If the environment variable is not set, replace the following line with your Model Studio API key: api_key = "sk-xxx"
           api_key=os.getenv("DASHSCOPE_API_KEY"),
           text=text,
           voice="myvoice", # Replace the voice parameter with the custom voice generated by voice design
           stream=False
       )
       print(response)
   ```
   
   ### Java
   
   ```
   import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
   import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
   import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
   import com.alibaba.dashscope.exception.ApiException;
   import com.alibaba.dashscope.exception.NoApiKeyException;
   import com.alibaba.dashscope.exception.UploadFileException;
   
   import com.alibaba.dashscope.utils.Constants;
   import java.io.FileOutputStream;
   import java.io.InputStream;
   import java.net.URL;
   
   public class Main {
       private static final String MODEL = "qwen3-tts-vd-2026-01-26";
       public static void call() throws ApiException, NoApiKeyException, UploadFileException {
           MultiModalConversation conv = new MultiModalConversation();
           MultiModalConversationParam param = MultiModalConversationParam.builder()
                   // API keys differ between Singapore and Beijing regions. Get an API key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key
                   // If the environment variable is not set, replace the following line with your Model Studio API key: .apiKey("sk-xxx")
                   .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                   .model(MODEL)
                   .text("Today is a wonderful day to build something people love!")
                   .parameter("voice", "myvoice") // Replace the voice parameter with the custom voice generated by voice design
                   .build();
           MultiModalConversationResult result = conv.call(param);
           String audioUrl = result.getOutput().getAudio().getUrl();
           System.out.print(audioUrl);
   
           // Download the audio file locally
           try (InputStream in = new URL(audioUrl).openStream();
                FileOutputStream out = new FileOutputStream("downloaded_audio.wav")) {
               byte[] buffer = new byte[1024];
               int bytesRead;
               while ((bytesRead = in.read(buffer)) != -1) {
                   out.write(buffer, 0, bytesRead);
               }
               System.out.println("\nAudio file downloaded locally: downloaded_audio.wav");
           } catch (Exception e) {
               System.out.println("\nError downloading audio file: " + e.getMessage());
           }
       }
       public static void main(String[] args) {
           try {
               // The following is the URL for the Singapore region. If you use a model in the Beijing region, replace the URL with: https://dashscope.aliyuncs.com/api/v1
               Constants.baseHttpApiUrl = "https://dashscope-intl.aliyuncs.com/api/v1";
               call();
           } catch (ApiException | NoApiKeyException | UploadFileException e) {
               System.out.println(e.getMessage());
           }
           System.exit(0);
       }
   }
   ```

## **Instruction control**

Instruction control adjusts speech expressiveness through natural language descriptions. Adjust pitch, speed, emotion, and timbre without manually tuning audio parameters.

**Supported models** : Qwen3-TTS-Instruct-Flash series only.

**Usage** : Set the `instructions` parameter, for example, "Speak at a relatively fast speed with a noticeable rising intonation, suitable for introducing fashion products."

**Supported languages** : Instruction text supports only Chinese and English.

**Length limit** : 1,600 tokens maximum.

**Scenarios** :

* Audiobook and radio drama dubbing
* Advertising and promotional video dubbing
* Game character and animation dubbing
* Emotional intelligent voice assistants
* Documentary and news broadcasting

**How to write high-quality voice descriptions:**

* Core principles:
  
    1. Be specific, not vague: Use words that describe concrete voice characteristics, such as "deep," "crisp," or "fast-paced." Avoid subjective and uninformative terms such as "nice" or "normal."
    2. Be multi-dimensional, not single-dimensional: A good description combines multiple dimensions, such as pitch, speed, and emotion. A single-dimensional description, such as only "high-pitched," is too broad to generate a distinctive effect.
    3. Be objective, not subjective: Focus on the physical and perceptual characteristics of the sound itself, not personal preferences. For example, use "high-pitched and energetic" instead of "my favorite sound."
    4. Be original, not imitative: Describe voice characteristics rather than requesting imitation of a specific person, such as a celebrity or actor. Such requests involve copyright risks and are not supported.
    5. Be concise, not redundant: Ensure every word adds meaning. Avoid repeating synonyms or meaningless intensifiers, such as "a very, very good voice."
* Dimension reference: Combine multiple dimensions for richer expression.
  
  |**Dimension** |**Description example** |
  | --- | --- |
  |Pitch |High, medium, low, high-pitched, low-pitched |
  |Speed |Fast, medium, slow, fast-paced, slow-paced |
  |Emotion |Cheerful, calm, gentle, serious, lively, composed, soothing |
  |Characteristics |Magnetic, crisp, hoarse, mellow, sweet, deep, powerful |
  |Usage |News broadcast, ad voice-over, audiobook, animation character, voice assistant, documentary narration |
* Examples:
  
    + Standard broadcast style: Clear and precise articulation, well-rounded pronunciation.
    + Progressive emotional effect: Volume rapidly increases from normal conversation to a shout, with a straightforward personality and easily excited, expressive emotions.
    + Special emotional state: A sobbing tone causes slightly slurred and hoarse pronunciation, with noticeable tension in the crying voice.
    + Ad voice-over style: High-pitched, medium speed, full of energy and appeal, suitable for ad voice-overs.
    + Gentle and soothing style: Slow-paced, with a gentle and sweet pitch, and a soothing, warm tone, like a caring friend.

## **API reference**

Speech synthesis - Qwen API reference

Voice cloning - API reference

Voice design - API reference

## **Model feature comparison**

|**Features** |**Qwen3-TTS-Instruct-Flash** |**Qwen3-TTS-VD** |**Qwen3-TTS-VC** |**Qwen3-TTS-Flash** |**Qwen-TTS** |
| --- | --- | --- | --- | --- | --- |
|**Supported languages** |Varies by voice : Chinese (Mandarin), English, Spanish, Russian, Italian, French, Korean, Japanese, German, Portuguese |Chinese (Mandarin), English, Spanish, Russian, Italian, French, Korean, Japanese, German, Portuguese |Varies by voice : Chinese (Mandarin, Shanghainese, Beijing dialect, Sichuan dialect, Nanjing dialect, Shaanxi dialect, Southern Min, Tianjin dialect), Cantonese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |Varies by voice : Chinese (Mandarin, Shanghainese, Beijing dialect, Sichuan dialect), English |
|**Audio format** |* wav: for non-streaming output
* pcm: for streaming output, Base64-encoded |
|**Audio sample rate** |24 kHz |
|**Voice cloning** |Not supported |Supported |Not supported |
|**Voice design** |No |Supported |No |
|**SSML** |No |
|**LaTeX** |No |
|**Volume control** |Supported

> Adjustable via instruction control |Not supported |
|**Speech rate control** |Supported

> Adjustable via instruction control |Not supported |
|**Pitch control** |Supported

> Adjustable via instruction control |No |
|**Bitrate control** |No |
|**Timestamp** |No |
|**Instruction control** |Supported |No |
|**Streaming input** |Not supported |
|**Streaming output** |Supported |
|**Rate limiting** |Requests per minute (RPM): 180 |RPM: 180 |RPM: 180 |RPM varies by model:

* qwen3-tts-flash, qwen3-tts-flash-2025-11-27: 180
* qwen3-tts-flash-2025-09-18: 10 |RPM: 10

Tokens per minute (TPM), including input and output tokens: 100,000 |
|**Connection type** |Java/Python SDK, WebSocket API |
|**Pricing** |International: $ 0\.115 /10,000 characters

Chinese mainland: $ 0\.115 /10,000 characters |International: $ 0\.115 /10,000 characters

Chinese mainland: $ 0\.115 /10,000 characters |International: $ 0\.115 /10,000 characters

Chinese mainland: $ 0\.115 /10,000 characters |International: $0.1/10,000 characters

Chinese mainland: $0.114682/10,000 characters |Chinese mainland:

* Input cost: $0.230/1,000 tokens
* Output cost: $1.434/1,000 tokens

Token conversion: 1 second of audio equals 50 tokens. Audio shorter than 1 second counts as 50 tokens. |

## **Supported system voices**

Supported voices vary by model. Set the `voice` request parameter to the corresponding value in the **voice parameter** column of the voice list.

|`**voice**` **parameter** |**Details** |**Supported languages** |**Supported models** |
| --- | --- | --- | --- |
|`Cherry` |**Voice name** : Cherry

**Description** : A sunny, positive, friendly, and natural young woman (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18
* **Qwen-TTS** : qwen-tts, qwen-tts-2025-04-10, qwen-tts-latest, qwen-tts-2025-05-22 |
|`Serena` |**Voice name** : Serena

**Description** : A gentle young woman (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27
* **Qwen-TTS** : qwen-tts, qwen-tts-2025-04-10, qwen-tts-latest, qwen-tts-2025-05-22 |
|`Ethan` |**Voice name** : Ethan

**Description** : Standard Mandarin with a slight northern accent. Sunny, warm, energetic, and vibrant (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18
* **Qwen-TTS** : qwen-tts, qwen-tts-2025-04-10, qwen-tts-latest, qwen-tts-2025-05-22 |
|`Chelsie` |**Voice name** : Chelsie

**Description** : A two-dimensional virtual girlfriend (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27
* **Qwen-TTS** : qwen-tts, qwen-tts-2025-04-10, qwen-tts-latest, qwen-tts-2025-05-22 |
|`Momo` |**Voice name** : Momo

**Description** : Playful and mischievous, cheering you up (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Vivian` |**Voice name** : Vivian

**Description** : Confident, cute, and slightly feisty (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Moon` |**Voice name** : Moon

**Description** : A bold and handsome man named Yuebai (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Maia` |**Voice name** : Maia

**Description** : A blend of intellect and gentleness (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Kai` |**Voice name** : Kai

**Description** : A soothing audio spa for your ears (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Nofish` |**Voice name** : Nofish

**Description** : A designer who cannot pronounce retroflex sounds (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Bella` |**Voice name** : Bella

**Description** : A little girl who drinks but never throws punches when drunk (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Jennifer` |**Voice name** : Jennifer

**Description** : A premium, cinematic-quality American English female voice (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Ryan` |**Voice name** : Ryan

**Description** : Full of rhythm, bursting with dramatic flair, balancing authenticity and tension (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Katerina` |**Voice name** : Katerina

**Description** : A mature-woman voice with rich, memorable rhythm (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Aiden` |**Voice name** : Aiden

**Description** : An American English young man skilled in cooking (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Eldric Sage` |**Voice name** : Eldric Sage

**Description** : A calm and wise elder—weathered like a pine tree, yet clear-minded as a mirror (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Mia` |**Voice name** : Mia

**Description** : Gentle as spring water, obedient as fresh snow (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Mochi` |**Voice name** : Mochi

**Description** : A clever, quick-witted young adult—childlike innocence remains, yet wisdom shines through (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Bellona` |**Voice name** : Bellona

**Description** : A powerful, clear voice that brings characters to life—so stirring it makes your blood boil. With heroic grandeur and perfect diction, this voice captures the full spectrum of human expression. |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Vincent` |**Voice name** : Vincent

**Description** : A uniquely raspy, smoky voice—just one line evokes armies and heroic tales (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Bunny` |**Voice name** : Bunny

**Description** : A little girl overflowing with "cuteness" (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Neil` |**Voice name** : Neil

**Description** : A flat baseline intonation with precise, clear pronunciation—the most professional news anchor (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Elias` |**Voice name** : Elias

**Description** : Maintains academic rigor while using storytelling techniques to turn complex knowledge into digestible learning modules (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Arthur` |**Voice name** : Arthur

**Description** : A simple, earthy voice steeped in time and tobacco smoke—slowly unfolding village stories and curiosities (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Nini` |**Voice name** : Nini

**Description** : A soft, clingy voice like sweet rice cakes—those drawn-out calls of “Big Brother” are so sweet they melt your bones (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Seren` |**Voice name** : Seren

**Description** : A gentle, soothing voice to help you fall asleep faster. Good night, sweet dreams (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Pip` |**Voice name** : Pip

**Description** : A playful, mischievous boy full of childlike wonder—is this your memory of Shin-chan? (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Stella` |**Voice name** : Stella

**Description** : Normally a cloyingly sweet, dazed teenage-girl voice—but when shouting “I represent the moon to defeat you!”, she instantly radiates unwavering love and justice (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Bodega` |**Voice name** : Bodega

**Description** : A passionate Spanish man (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Sonrisa` |**Voice name** : Sonisa

**Description** : A cheerful, outgoing Latin American woman (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Alek` |**Voice name** : Alek

**Description** : Cold like the Russian spirit, yet warm like wool coat lining (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Dolce` |**Voice name** : Dolce

**Description** : A laid-back Italian man (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Sohee` |**Voice name** : Sohee

**Description** : A warm, cheerful, emotionally expressive Korean unnie (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Ono Anna` |**Voice name** : Ono Anna

**Description** : A clever, spirited childhood friend (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Lenn` |**Voice name** : Lenn

**Description** : Rational at heart, rebellious in detail—a German youth who wears suits and listens to post-punk |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Emilien` |**Voice name** : Emilien

**Description** : A romantic French big brother (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Andre` |**Voice name** : Andre

**Description** : A magnetic, natural, and steady male voice |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Radio Gol` |**Voice name** : Radio Gol

**Description** : Football poet Radio Gol! Today I’ll commentate on football using my name (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Jada` |**Voice name** : Shanghai - Jada

**Description** : A fast-paced, energetic Shanghai auntie (female) |Shanghainese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18
* **Qwen-TTS** : qwen-tts-latest, qwen-tts-2025-05-22 |
|`Dylan` |**Voice name** : Beijing - Dylan

**Description** : A young man raised in Beijing’s hutongs (male) |Beijing dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18
* **Qwen-TTS** : qwen-tts-latest, qwen-tts-2025-05-22 |
|`Li` |**Voice name** : Nanjing - Li

**Description** : A patient yoga teacher (male) |Nanjing dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Marcus` |**Voice name** : Shaanxi - Marcus

**Description** : Broad face, few words, sincere heart, deep voice—the authentic Shaanxi flavor (male) |Shaanxi dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Roy` |**Voice name** : Southern Min - Roy

**Description** : A humorous, straightforward, lively Taiwanese guy (male) |Southern Min, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Peter` |**Voice name** : Tianjin - Peter

**Description** : Tianjin-style crosstalk, professional foil (male) |Tianjin dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, and qwen3-tts-flash-2025-09-18 |
|`Sunny` |**Voice name** : Sichuan - Sunny

**Description** : A Sichuan girl sweet enough to melt your heart (female) |Sichuan dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18
* **Qwen-TTS** : qwen-tts-latest, qwen-tts-2025-05-22 |
|`Eric` |**Voice name** : Sichuan - Eric

**Description** : A Sichuanese man from Chengdu who stands out in everyday life (male) |Sichuan dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Rocky` |**Voice name** : Cantonese - Rocky

**Description** : A humorous, witty A Qiang providing live chat (male) |Cantonese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, and qwen3-tts-flash-2025-09-18 |
|`Kiki` |**Voice name** : Cantonese - Kiki

**Description** : A sweet Hong Kong girl best friend (female) |Cantonese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, and qwen3-tts-flash-2025-09-18 |

## **FAQ**

### **Q: How long is the audio file URL valid?**

A: The audio file URL expires after 24 hours.
Document Center

All Products

Search

* Document Center
* Alibaba Cloud Model Studio
* User Guide (Models)")
* Inference
* Speech synthesis
* Speech synthesis - Qwen

all-products-head

This Product

Alibaba Cloud Model Studio:Speech synthesis - Qwen

Document Center

# Alibaba Cloud Model Studio:Speech synthesis - Qwen

Last Updated:Mar 31, 2026

Qwen speech synthesis delivers human-like voices with natural intonation and expressive delivery. It supports multiple languages and dialects, including Chinese dialects, and enables multilingual output using a single voice. The system automatically adapts tone and handles complex text smoothly.

## **Core features**

* Supports streaming output, enabling real-time audio synthesis and playback.
* Supports multiple languages and dialects, including Chinese dialects.
* Provides a wide range of voices to suit diverse use cases.
* Offers two voice customization methods: voice cloning and voice design .
* Supports instruction control , which lets you adjust speech expressiveness using natural language instructions.

## **Applicability**

**Available models:**

## International

In international deployment mode , the endpoint and data storage are in the **Singapore region** . Model inference computing resources are dynamically scheduled worldwide, excluding the Chinese mainland.

When you call the following models, select an [API key](https://modelstudio.console.alibabacloud.com/?tab=dashboard#/api-key) for the Singapore region:

* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash (stable version, currently equivalent to qwen3-tts-instruct-flash-2026-01-26), qwen3-tts-instruct-flash-2026-01-26 (latest snapshot version)
* **Qwen3-TTS-VD** : qwen3-tts-vd-2026-01-26 (latest snapshot version)
* **Qwen3-TTS-VC** : qwen3-tts-vc-2026-01-22 (latest snapshot version)
* **Qwen3-TTS-Flash** : qwen3-tts-flash (stable version, currently equivalent to qwen3-tts-flash-2025-11-27), qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18

## Chinese mainland

In Chinese mainland deployment mode , the endpoint and data storage are in the **Beijing region** . Model inference computing resources are limited to the Chinese mainland.

When you call the following models, select an [API key](https://bailian.console.alibabacloud.com/?tab=model#/api-key) for the Beijing region:

* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash (stable version, currently equivalent to qwen3-tts-instruct-flash-2026-01-26), qwen3-tts-instruct-flash-2026-01-26 (latest snapshot version)
* **Qwen3-TTS-VD** : qwen3-tts-vd-2026-01-26 (latest snapshot version)
* **Qwen3-TTS-VC** : qwen3-tts-vc-2026-01-22 (latest snapshot version)
* **Qwen3-TTS-Flash** : qwen3-tts-flash (stable version, currently equivalent to qwen3-tts-flash-2025-11-27), qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18
* **Qwen-TTS** : qwen-tts (stable version, currently equivalent to qwen-tts-2025-04-10), qwen-tts-latest (latest version, currently equivalent to qwen-tts-2025-05-22), qwen-tts-2025-05-22 (snapshot version), qwen-tts-2025-04-10 (snapshot version)

See Model list .

## **Choose a model**

|**Scenario** |**Recommended model** |**Reason** |
| --- | --- | --- |
|**Custom voice for branding, exclusive voices, or extended system voices (from a text description)** |qwen3-tts-vd-2026-01-26 |Supports voice design. Create a custom voice from a text description without an audio sample. Ideal for designing a brand voice from scratch. |
|**Custom voice for branding, exclusive voices, or extended system voices (from an audio sample)** |qwen3-tts-vc-2026-01-22 |Supports voice cloning. Clone a voice from an audio sample to create a human-like brand voiceprint with high fidelity and consistency. |
|**Emotional content production (audiobooks, radio dramas, game/animation dubbing)** |qwen3-tts-instruct-flash |Supports instruction control. Use natural language descriptions to control pitch, speed, emotion, and character personality. Ideal for scenarios requiring rich expression and character creation. |
|**Mobile navigation or notification announcements** |qwen3-tts-flash |Simple and transparent per-character billing. Ideal for high-frequency calls with short text. |
|**Online education courseware dubbing** |qwen3-tts-flash |Supports multiple languages and dialects to meet regional teaching needs. |
|**Batch audiobook production** |qwen3-tts-flash |Cost-effective. A wide selection of voices enriches content expression. |

See Model feature comparison .

## **Getting started**

**Preparations**

* Configure an API key and export it as an environment variable .
* If you call the service using the DashScope SDK, install the latest SDK version . The DashScope Java SDK must be version 2.21.9 or later. The DashScope Python SDK must be version 1.24.6 or later.
  
  **Note**
  
  In the DashScope Python SDK, the `SpeechSynthesizer` interface has been unified into `MultiModalConversation` . Replace the interface name. All other parameters remain compatible.

## Synthesize speech with a system voice

These examples synthesize speech with a system voice .

## Non-streaming output

Retrieve the synthesized speech from the returned `url` . The URL remains valid for 24 hours.

## Python

```
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
```

## Java

You need to import the Gson dependency. If you use Maven or Gradle, add the dependency as follows:

### Maven

Add the following content to `pom.xml` :

```
<!-- https://mvnrepository.com/artifact/com.google.code.gson/gson -->
<dependency>
    <groupId>com.google.code.gson</groupId>
    <artifactId>gson</artifactId>
    <version>2.13.1</version>
</dependency>
```

### Gradle

Add the following content to `build.gradle` :

```
// https://mvnrepository.com/artifact/com.google.code.gson/gson
implementation("com.google.code.gson:gson:2.13.1")
```

```
import com.alibaba.dashscope.aigc.multimodalconversation.AudioParameters;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.protocol.Protocol;
import com.alibaba.dashscope.utils.Constants;

import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URL;

public class Main {
    // To use the instruction control feature, change MODEL to qwen3-tts-instruct-flash.
    private static final String MODEL = "qwen3-tts-flash";
    public static void call() throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // The API keys for the Singapore and China (Beijing) regions are different. Get an API key: https://www.alibabacloud.com/help/en/model-studio/get-api-key
                // If you have not configured the environment variable, replace the following line with your Model Studio API key: .apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model(MODEL)
                .text("Today is a wonderful day to build something people love!")
                .voice(AudioParameters.Voice.CHERRY)
                .languageType("English") // Match the language type to the text language for correct pronunciation and natural intonation.
                // To use the instruction control feature, uncomment the following lines and change the model to qwen3-tts-instruct-flash.
                // .parameter("instructions","Speak at a relatively fast speed with a noticeable rising intonation, suitable for introducing fashion products.")
                // .parameter("optimize_instructions",true)
                .build();
        MultiModalConversationResult result = conv.call(param);
        String audioUrl = result.getOutput().getAudio().getUrl();
        System.out.print(audioUrl);

        // Download the audio file to your local machine.
        try (InputStream in = new URL(audioUrl).openStream();
             FileOutputStream out = new FileOutputStream("downloaded_audio.wav")) {
            byte[] buffer = new byte[1024];
            int bytesRead;
            while ((bytesRead = in.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
            }
            System.out.println("\nAudio file downloaded to: downloaded_audio.wav");
        } catch (Exception e) {
            System.out.println("\nError downloading audio file: " + e.getMessage());
        }
    }
    public static void main(String[] args) {
        // This is the URL for the Singapore region. If you use a model in the China (Beijing) region, change the URL to: https://dashscope.aliyuncs.com/api/v1
        Constants.baseHttpApiUrl = "https://dashscope-intl.aliyuncs.com/api/v1";
        try {
            call();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

## cURL

```
# ======= Important =======
# This is the URL for the Singapore region. If you use a model in the China (Beijing) region, change the URL to: https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# The API keys for the Singapore and China (Beijing) regions are different. Get an API key: https://www.alibabacloud.com/help/en/model-studio/get-api-key
# === Delete this comment before execution ===

curl -X POST 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
    "model": "qwen3-tts-flash",
    "input": {
        "text": "Today is a wonderful day to build something people love!",
        "voice": "Cherry",
        "language_type": "English"
    }
}'
```

## Streaming output

Audio data is streamed in Base64 format. The final data packet contains the URL of the complete audio file.

## Python

```
# coding=utf-8
#
# Installation instructions for pyaudio:
# APPLE Mac OS X
#   brew install portaudio
#   pip install pyaudio
# Debian/Ubuntu
#   sudo apt-get install python-pyaudio python3-pyaudio
#   or
#   pip install pyaudio
# CentOS
#   sudo yum install -y portaudio portaudio-devel && pip install pyaudio
# Microsoft Windows
#   python -m pip install pyaudio

import os
import dashscope
import pyaudio
import time
import base64
import numpy as np

# This is the URL for the Singapore region. If you use a model in the China (Beijing) region, change the URL to: https://dashscope.aliyuncs.com/api/v1
dashscope.base_http_api_url = 'https://dashscope-intl.aliyuncs.com/api/v1'

p = pyaudio.PyAudio()
# Create an audio stream.
stream = p.open(format=pyaudio.paInt16,
                channels=1,
                rate=24000,
                output=True)

text = "Today is a wonderful day to build something people love!"
response = dashscope.MultiModalConversation.call(
    # The API keys for the Singapore and China (Beijing) regions are different. Get an API key: https://www.alibabacloud.com/help/en/model-studio/get-api-key
    # If you have not configured the environment variable, replace the following line with your Model Studio API key: api_key = "sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    # To use the instruction control feature, change the model to qwen3-tts-instruct-flash.
    model="qwen3-tts-flash",
    text=text,
    voice="Cherry",
    language_type="English", # Match the language type to the text language for correct pronunciation and natural intonation.
    # To use the instruction control feature, uncomment the following lines and change the model to qwen3-tts-instruct-flash.
    # instructions='Speak at a relatively fast speed with a noticeable rising intonation, suitable for introducing fashion products.',
    # optimize_instructions=True,
    stream=True
)

for chunk in response:
    if chunk.output is not None:
      audio = chunk.output.audio
      if audio.data is not None:
          wav_bytes = base64.b64decode(audio.data)
          audio_np = np.frombuffer(wav_bytes, dtype=np.int16)
          # Play the audio data directly.
          stream.write(audio_np.tobytes())
      if chunk.output.finish_reason == "stop":
          print("finish at: {} ", chunk.output.audio.expires_at)
time.sleep(0.8)
# Clean up resources.
stream.stop_stream()
stream.close()
p.terminate()
```

## Java

You need to import the Gson dependency. If you use Maven or Gradle, add the dependency as follows:

### Maven

Add the following content to `pom.xml` :

```
<!-- https://mvnrepository.com/artifact/com.google.code.gson/gson -->
<dependency>
    <groupId>com.google.code.gson</groupId>
    <artifactId>gson</artifactId>
    <version>2.13.1</version>
</dependency>
```

### Gradle

Add the following content to `build.gradle` :

```
// https://mvnrepository.com/artifact/com.google.code.gson/gson
implementation("com.google.code.gson:gson:2.13.1")
```

```
// Install the latest version of the DashScope SDK.
import com.alibaba.dashscope.aigc.multimodalconversation.AudioParameters;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.protocol.Protocol;
import com.alibaba.dashscope.utils.Constants;
import io.reactivex.Flowable;
import javax.sound.sampled.*;
import java.util.Base64;

public class Main {
    // To use the instruction control feature, change MODEL to qwen3-tts-instruct-flash.
    private static final String MODEL = "qwen3-tts-flash";
    public static void streamCall() throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // The API keys for the Singapore and China (Beijing) regions are different. Get an API key: https://www.alibabacloud.com/help/en/model-studio/get-api-key
                // If you have not configured the environment variable, replace the following line with your Model Studio API key: .apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model(MODEL)
                .text("Today is a wonderful day to build something people love!")
                .voice(AudioParameters.Voice.CHERRY)
                .languageType("English") // Match the language type to the text language for correct pronunciation and natural intonation.
                // To use the instruction control feature, uncomment the following lines and change the model to qwen3-tts-instruct-flash.
                // .parameter("instructions","Speak at a relatively fast speed with a noticeable rising intonation, suitable for introducing fashion products.")
                // .parameter("optimize_instructions",true)
                .build();
        Flowable<MultiModalConversationResult> result = conv.streamCall(param);
        result.blockingForEach(r -> {
            try {
                // 1. Get the Base64-encoded audio data.
                String base64Data = r.getOutput().getAudio().getData();
                byte[] audioBytes = Base64.getDecoder().decode(base64Data);

                // 2. Configure the audio format. Adjust the format based on the API response.
                AudioFormat format = new AudioFormat(
                        AudioFormat.Encoding.PCM_SIGNED,
                        24000, // Sample rate. This must be consistent with the format returned by the API.
                        16,    // Audio bit depth
                        1,     // The number of sound channels
                        2,     // Frame size (bit depth/8)
                        24000, // Data transmission rate. This must be consistent with the sample rate.
                        false  // Specifies whether the data is compressed.
                );

                // 3. Play the audio data in real time.
                DataLine.Info info = new DataLine.Info(SourceDataLine.class, format);
                try (SourceDataLine line = (SourceDataLine) AudioSystem.getLine(info)) {
                    if (line != null) {
                        line.open(format);
                        line.start();
                        line.write(audioBytes, 0, audioBytes.length);
                        line.drain();
                    }
                }
            } catch (LineUnavailableException e) {
                e.printStackTrace();
            }
        });
    }
    public static void main(String[] args) {
        // This is the URL for the Singapore region. If you use a model in the China (Beijing) region, change the URL to: https://dashscope.aliyuncs.com/api/v1
        Constants.baseHttpApiUrl = "https://dashscope-intl.aliyuncs.com/api/v1";
        try {
            streamCall();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

## cURL

```
# ======= Important =======
# This is the URL for the Singapore region. If you use a model in the China (Beijing) region, change the URL to: https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# The API keys for the Singapore and China (Beijing) regions are different. Get an API key: https://www.alibabacloud.com/help/en/model-studio/get-api-key
# === Delete this comment before execution ===

curl -X POST 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H 'Content-Type: application/json' \
-H 'X-DashScope-SSE: enable' \
-d '{
    "model": "qwen3-tts-flash",
    "input": {
        "text": "Today is a wonderful day to build something people love!",
        "voice": "Cherry",
        "language_type": "Chinese"
    }
}'
```

## Synthesize speech with a cloned voice

Voice cloning does not provide preview audio. To evaluate the result, apply the cloned voice to speech synthesis.

This example uses a cloned voice for speech synthesis, producing output closely matching the original voice. It builds on the non-streaming output sample for the DashScope SDK, with the `voice` parameter set to the cloned voice.

* **Key principle** : The model used for voice cloning ( `target_model` ) must match the model used for speech synthesis ( `model` ). Otherwise, synthesis fails.
* The example uses the local audio file `voice.mp3` for voice cloning. When you run the code, replace the file path with your own.

### Python

```
import os
import requests
import base64
import pathlib
import dashscope

# ======= Constant configuration =======
DEFAULT_TARGET_MODEL = "qwen3-tts-vc-2026-01-22"  # Use the same model for voice cloning and speech synthesis
DEFAULT_PREFERRED_NAME = "guanyu"
DEFAULT_AUDIO_MIME_TYPE = "audio/mpeg"
VOICE_FILE_PATH = "voice.mp3"  # Relative path to the local audio file used for voice cloning

def create_voice(file_path: str,
                 target_model: str = DEFAULT_TARGET_MODEL,
                 preferred_name: str = DEFAULT_PREFERRED_NAME,
                 audio_mime_type: str = DEFAULT_AUDIO_MIME_TYPE) -> str:
    """
    Create a voice and return the voice parameter.
    """
    # If you haven't configured an environment variable, replace the following line with: api_key = "sk-xxx"
    api_key = os.getenv("DASHSCOPE_API_KEY")

    file_path_obj = pathlib.Path(file_path)
    if not file_path_obj.exists():
        raise FileNotFoundError(f"Audio file does not exist: {file_path}")

    base64_str = base64.b64encode(file_path_obj.read_bytes()).decode()
    data_uri = f"data:{audio_mime_type};base64,{base64_str}"

    # Singapore region endpoint. For the Beijing region, use: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization
    url = "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization"
    payload = {
        "model": "qwen-voice-enrollment", # Do not change this value
        "input": {
            "action": "create",
            "target_model": target_model,
            "preferred_name": preferred_name,
            "audio": {"data": data_uri}
        }
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    resp = requests.post(url, json=payload, headers=headers)
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to create voice: {resp.status_code}, {resp.text}")

    try:
        return resp.json()["output"]["voice"]
    except (KeyError, ValueError) as e:
        raise RuntimeError(f"Failed to parse voice response: {e}")

if __name__ == '__main__':
    # Singapore region endpoint. For the Beijing region, use: https://dashscope.aliyuncs.com/api/v1
    dashscope.base_http_api_url = 'https://dashscope-intl.aliyuncs.com/api/v1'

    text = "How's the weather today?"
    # SpeechSynthesizer interface usage: dashscope.audio.qwen_tts.SpeechSynthesizer.call(...)
    response = dashscope.MultiModalConversation.call(
        model=DEFAULT_TARGET_MODEL,
        # If you haven't configured an environment variable, replace the following line with: api_key = "sk-xxx"
        api_key=os.getenv("DASHSCOPE_API_KEY"),
        text=text,
        voice=create_voice(VOICE_FILE_PATH), # Replace the voice parameter with the custom voice generated by cloning
        stream=False
    )
    print(response)
```

### Java

Add the Gson dependency to your project.

#### Maven

Add the following content to `pom.xml` :

```
<!-- https://mvnrepository.com/artifact/com.google.code.gson/gson -->
<dependency>
    <groupId>com.google.code.gson</groupId>
    <artifactId>gson</artifactId>
    <version>2.13.1</version>
</dependency>
```

#### Gradle

Add the following content to `build.gradle` :

```
// https://mvnrepository.com/artifact/com.google.code.gson/gson
implementation("com.google.code.gson:gson:2.13.1")
```

**Important**

When you use speech synthesis with a custom voice generated by voice cloning, configure the voice as follows:

```
MultiModalConversationParam param = MultiModalConversationParam.builder()
                .parameter("voice", "your_voice") // Replace the voice parameter with the custom voice generated by cloning
                .build();
```

```
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.utils.Constants;
import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class Main {
    // ===== Constant definitions =====
    // Use the same model for voice cloning and speech synthesis
    private static final String TARGET_MODEL = "qwen3-tts-vc-2026-01-22";
    private static final String PREFERRED_NAME = "guanyu";
    // Relative path to the local audio file used for voice cloning
    private static final String AUDIO_FILE = "voice.mp3";
    private static final String AUDIO_MIME_TYPE = "audio/mpeg";

    // Generate a data URI
    public static String toDataUrl(String filePath) throws IOException {
        byte[] bytes = Files.readAllBytes(Paths.get(filePath));
        String encoded = Base64.getEncoder().encodeToString(bytes);
        return "data:" + AUDIO_MIME_TYPE + ";base64," + encoded;
    }

    // Call the API to create a voice
    public static String createVoice() throws Exception {
        // API keys differ between the Singapore and Beijing regions. To obtain an API key, see https://www.alibabacloud.com/help/zh/model-studio/get-api-key
        // If you haven't configured an environment variable, replace the following line with: String apiKey = "sk-xxx"
        String apiKey = System.getenv("DASHSCOPE_API_KEY");

        String jsonPayload =
                "{"
                        + "\"model\": \"qwen-voice-enrollment\"," // Do not change this value
                        + "\"input\": {"
                        +     "\"action\": \"create\","
                        +     "\"target_model\": \"" + TARGET_MODEL + "\","
                        +     "\"preferred_name\": \"" + PREFERRED_NAME + "\","
                        +     "\"audio\": {"
                        +         "\"data\": \"" + toDataUrl(AUDIO_FILE) + "\""
                        +     "}"
                        + "}"
                        + "}";

        // Singapore region endpoint. For the Beijing region, use: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization
        String url = "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization";
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setRequestMethod("POST");
        con.setRequestProperty("Authorization", "Bearer " + apiKey);
        con.setRequestProperty("Content-Type", "application/json");
        con.setDoOutput(true);

        try (OutputStream os = con.getOutputStream()) {
            os.write(jsonPayload.getBytes(StandardCharsets.UTF_8));
        }

        int status = con.getResponseCode();
        System.out.println("HTTP status code: " + status);

        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(status >= 200 && status < 300 ? con.getInputStream() : con.getErrorStream(),
                        StandardCharsets.UTF_8))) {
            StringBuilder response = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                response.append(line);
            }
            System.out.println("Response content: " + response);

            if (status == 200) {
                JsonObject jsonObj = new Gson().fromJson(response.toString(), JsonObject.class);
                return jsonObj.getAsJsonObject("output").get("voice").getAsString();
            }
            throw new IOException("Failed to create voice: " + status + " - " + response);
        }
    }

    public static void call() throws Exception {
        MultiModalConversation conv = new MultiModalConversation();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // API keys differ between the Singapore and Beijing regions. To obtain an API key, see https://www.alibabacloud.com/help/zh/model-studio/get-api-key
                // If you haven't configured an environment variable, replace the following line with: .apikey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model(TARGET_MODEL)
                .text("How's the weather today?")
                .parameter("voice", createVoice()) // Replace the voice parameter with the custom voice generated by cloning
                .build();
        MultiModalConversationResult result = conv.call(param);
        String audioUrl = result.getOutput().getAudio().getUrl();
        System.out.print(audioUrl);

        // Download the audio file locally
        try (InputStream in = new URL(audioUrl).openStream();
             FileOutputStream out = new FileOutputStream("downloaded_audio.wav")) {
            byte[] buffer = new byte[1024];
            int bytesRead;
            while ((bytesRead = in.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
            }
            System.out.println("\nAudio file downloaded locally: downloaded_audio.wav");
        } catch (Exception e) {
            System.out.println("\nError downloading audio file: " + e.getMessage());
        }
    }
    public static void main(String[] args) {
        try {
            // Singapore region endpoint. For the Beijing region, use: https://dashscope.aliyuncs.com/api/v1
            Constants.baseHttpApiUrl = "https://dashscope-intl.aliyuncs.com/api/v1";
            call();
        } catch (Exception e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

## Using voice design timbre for speech synthesis

The voice design feature returns preview audio. Listen to the preview to confirm it meets your expectations before using it for synthesis. This reduces call costs.

1. Create a custom voice and preview it. If satisfied, proceed. Otherwise, recreate.
   
   ### Python
   
   ```
   import requests
   import base64
   import os
   
   def create_voice_and_play():
       # API keys differ between Singapore and Beijing regions. Get an API key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key
       # If the environment variable is not set, replace the following line with your Model Studio API key: api_key = "sk-xxx"
       api_key = os.getenv("DASHSCOPE_API_KEY")
       
       if not api_key:
           print("Error: DASHSCOPE_API_KEY environment variable not found. Please set the API key first.")
           return None, None, None
       
       # Prepare request data
       headers = {
           "Authorization": f"Bearer {api_key}",
           "Content-Type": "application/json"
       }
       
       data = {
           "model": "qwen-voice-design",
           "input": {
               "action": "create",
               "target_model": "qwen3-tts-vd-2026-01-26",
               "voice_prompt": "A composed middle-aged male announcer with a deep, rich and magnetic voice, a steady speaking speed and clear articulation, is suitable for news broadcasting or documentary commentary.",
               "preview_text": "Dear listeners, hello everyone. Welcome to the evening news.",
               "preferred_name": "announcer",
               "language": "en"
           },
           "parameters": {
               "sample_rate": 24000,
               "response_format": "wav"
           }
       }
       
       # The following is the URL for the Singapore region. If you use a model in the Beijing region, replace the URL with: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization
       url = "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization"
       
       try:
           # Send the request
           response = requests.post(
               url,
               headers=headers,
               json=data,
               timeout=60  # Add a timeout setting
           )
           
           if response.status_code == 200:
               result = response.json()
               
               # Get the voice name
               voice_name = result["output"]["voice"]
               print(f"Voice name: {voice_name}")
               
               # Get the preview audio data
               base64_audio = result["output"]["preview_audio"]["data"]
               
               # Decode the Base64 audio data
               audio_bytes = base64.b64decode(base64_audio)
               
               # Save the audio file locally
               filename = f"{voice_name}_preview.wav"
               
               # Write the audio data to a local file
               with open(filename, 'wb') as f:
                   f.write(audio_bytes)
               
               print(f"Audio saved to local file: {filename}")
               print(f"File path: {os.path.abspath(filename)}")
               
               return voice_name, audio_bytes, filename
           else:
               print(f"Request failed with status code: {response.status_code}")
               print(f"Response content: {response.text}")
               return None, None, None
               
       except requests.exceptions.RequestException as e:
           print(f"A network request error occurred: {e}")
           return None, None, None
       except KeyError as e:
           print(f"Response data format error, missing required field: {e}")
           print(f"Response content: {response.text if 'response' in locals() else 'No response'}")
           return None, None, None
       except Exception as e:
           print(f"An unknown error occurred: {e}")
           return None, None, None
   
   if __name__ == "__main__":
       print("Starting to create voice...")
       voice_name, audio_data, saved_filename = create_voice_and_play()
       
       if voice_name:
           print(f"\nSuccessfully created voice '{voice_name}'")
           print(f"Audio file saved as: '{saved_filename}'")
           print(f"File size: {os.path.getsize(saved_filename)} bytes")
       else:
           print("\nVoice creation failed")
   ```
   
   ### Java
   
   Add the Gson dependency to your project:
   
   #### Maven
   
   Add the following to your `pom.xml` :
   
   ```
   <!-- https://mvnrepository.com/artifact/com.google.code.gson/gson -->
   <dependency>
       <groupId>com.google.code.gson</groupId>
       <artifactId>gson</artifactId>
       <version>2.13.1</version>
   </dependency>
   ```
   
   #### Gradle
   
   Add the following to your `build.gradle` :
   
   ```
   // https://mvnrepository.com/artifact/com.google.code.gson/gson
   implementation("com.google.code.gson:gson:2.13.1")
   ```
   
   **Important**
   
   To use a custom voice generated by voice design for speech synthesis, configure the voice as follows:
   
   ```
   MultiModalConversationParam param = MultiModalConversationParam.builder()
                   .parameter("voice", "your_voice") // Replace the voice parameter with the custom voice generated by voice design
                   .build();
   ```
   
   ```
   import com.google.gson.JsonObject;
   import com.google.gson.JsonParser;
   import java.io.*;
   import java.net.HttpURLConnection;
   import java.net.URL;
   import java.util.Base64;
   
   public class Main {
       public static void main(String[] args) {
           Main example = new Main();
           example.createVoice();
       }
   
       public void createVoice() {
           // API keys differ between Singapore and Beijing regions. Get an API key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key
           // If the environment variable is not set, replace the following line with your Model Studio API key: String apiKey = "sk-xxx"
           String apiKey = System.getenv("DASHSCOPE_API_KEY");
   
           // Create the JSON request body string
           String jsonBody = "{\n" +
                   "    \"model\": \"qwen-voice-design\",\n" +
                   "    \"input\": {\n" +
                   "        \"action\": \"create\",\n" +
                   "        \"target_model\": \"qwen3-tts-vd-2026-01-26\",\n" +
                   "        \"voice_prompt\": \"A composed middle-aged male announcer with a deep, rich and magnetic voice, a steady speaking speed and clear articulation, is suitable for news broadcasting or documentary commentary.\",\n" +
                   "        \"preview_text\": \"Dear listeners, hello everyone. Welcome to the evening news.\",\n" +
                   "        \"preferred_name\": \"announcer\",\n" +
                   "        \"language\": \"en\"\n" +
                   "    },\n" +
                   "    \"parameters\": {\n" +
                   "        \"sample_rate\": 24000,\n" +
                   "        \"response_format\": \"wav\"\n" +
                   "    }\n" +
                   "}";
   
           HttpURLConnection connection = null;
           try {
               // The following is the URL for the Singapore region. If you use a model in the Beijing region, replace the URL with: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization
               URL url = new URL("https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization");
               connection = (HttpURLConnection) url.openConnection();
   
               // Set the request method and headers
               connection.setRequestMethod("POST");
               connection.setRequestProperty("Authorization", "Bearer " + apiKey);
               connection.setRequestProperty("Content-Type", "application/json");
               connection.setDoOutput(true);
               connection.setDoInput(true);
   
               // Send the request body
               try (OutputStream os = connection.getOutputStream()) {
                   byte[] input = jsonBody.getBytes("UTF-8");
                   os.write(input, 0, input.length);
                   os.flush();
               }
   
               // Get the response
               int responseCode = connection.getResponseCode();
               if (responseCode == HttpURLConnection.HTTP_OK) {
                   // Read the response content
                   StringBuilder response = new StringBuilder();
                   try (BufferedReader br = new BufferedReader(
                           new InputStreamReader(connection.getInputStream(), "UTF-8"))) {
                       String responseLine;
                       while ((responseLine = br.readLine()) != null) {
                           response.append(responseLine.trim());
                       }
                   }
   
                   // Parse the JSON response
                   JsonObject jsonResponse = JsonParser.parseString(response.toString()).getAsJsonObject();
                   JsonObject outputObj = jsonResponse.getAsJsonObject("output");
                   JsonObject previewAudioObj = outputObj.getAsJsonObject("preview_audio");
   
                   // Get the voice name
                   String voiceName = outputObj.get("voice").getAsString();
                   System.out.println("Voice name: " + voiceName);
   
                   // Get the Base64-encoded audio data
                   String base64Audio = previewAudioObj.get("data").getAsString();
   
                   // Decode the Base64 audio data
                   byte[] audioBytes = Base64.getDecoder().decode(base64Audio);
   
                   // Save the audio to a local file
                   String filename = voiceName + "_preview.wav";
                   saveAudioToFile(audioBytes, filename);
   
                   System.out.println("Audio saved to local file: " + filename);
   
               } else {
                   // Read the error response
                   StringBuilder errorResponse = new StringBuilder();
                   try (BufferedReader br = new BufferedReader(
                           new InputStreamReader(connection.getErrorStream(), "UTF-8"))) {
                       String responseLine;
                       while ((responseLine = br.readLine()) != null) {
                           errorResponse.append(responseLine.trim());
                       }
                   }
   
                   System.out.println("Request failed with status code: " + responseCode);
                   System.out.println("Error response: " + errorResponse.toString());
               }
   
           } catch (Exception e) {
               System.err.println("An error occurred during the request: " + e.getMessage());
               e.printStackTrace();
           } finally {
               if (connection != null) {
                   connection.disconnect();
               }
           }
       }
   
       private void saveAudioToFile(byte[] audioBytes, String filename) {
           try {
               File file = new File(filename);
               try (FileOutputStream fos = new FileOutputStream(file)) {
                   fos.write(audioBytes);
               }
               System.out.println("Audio saved to: " + file.getAbsolutePath());
           } catch (IOException e) {
               System.err.println("An error occurred while saving the audio file: " + e.getMessage());
               e.printStackTrace();
           }
       }
   }
   ```
2. Use the custom voice created in the previous step for non-streaming speech synthesis.
   
   This example follows the "non-streaming output" sample code for system voices in the DashScope SDK. Replace the `voice` parameter with the custom voice generated by voice design. For unidirectional streaming synthesis, see Speech synthesis - Qwen .
   
   **Key principle** : The model used for voice design ( `target_model` ) must match the model used for subsequent speech synthesis ( `model` ). Otherwise, synthesis fails.
   
   ### Python
   
   ```
   import os
   import dashscope
   
   
   if __name__ == '__main__':
       # The following is the URL for the Singapore region. If you use a model in the Beijing region, replace the URL with: https://dashscope.aliyuncs.com/api/v1
       dashscope.base_http_api_url = 'https://dashscope-intl.aliyuncs.com/api/v1'
   
       text = "What's the weather like today?"
       # How to use SpeechSynthesizer: dashscope.audio.qwen_tts.SpeechSynthesizer.call(...)
       response = dashscope.MultiModalConversation.call(
           model="qwen3-tts-vd-2026-01-26",
           # API keys differ between Singapore and Beijing regions. Get an API key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key
           # If the environment variable is not set, replace the following line with your Model Studio API key: api_key = "sk-xxx"
           api_key=os.getenv("DASHSCOPE_API_KEY"),
           text=text,
           voice="myvoice", # Replace the voice parameter with the custom voice generated by voice design
           stream=False
       )
       print(response)
   ```
   
   ### Java
   
   ```
   import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
   import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
   import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
   import com.alibaba.dashscope.exception.ApiException;
   import com.alibaba.dashscope.exception.NoApiKeyException;
   import com.alibaba.dashscope.exception.UploadFileException;
   
   import com.alibaba.dashscope.utils.Constants;
   import java.io.FileOutputStream;
   import java.io.InputStream;
   import java.net.URL;
   
   public class Main {
       private static final String MODEL = "qwen3-tts-vd-2026-01-26";
       public static void call() throws ApiException, NoApiKeyException, UploadFileException {
           MultiModalConversation conv = new MultiModalConversation();
           MultiModalConversationParam param = MultiModalConversationParam.builder()
                   // API keys differ between Singapore and Beijing regions. Get an API key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key
                   // If the environment variable is not set, replace the following line with your Model Studio API key: .apiKey("sk-xxx")
                   .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                   .model(MODEL)
                   .text("Today is a wonderful day to build something people love!")
                   .parameter("voice", "myvoice") // Replace the voice parameter with the custom voice generated by voice design
                   .build();
           MultiModalConversationResult result = conv.call(param);
           String audioUrl = result.getOutput().getAudio().getUrl();
           System.out.print(audioUrl);
   
           // Download the audio file locally
           try (InputStream in = new URL(audioUrl).openStream();
                FileOutputStream out = new FileOutputStream("downloaded_audio.wav")) {
               byte[] buffer = new byte[1024];
               int bytesRead;
               while ((bytesRead = in.read(buffer)) != -1) {
                   out.write(buffer, 0, bytesRead);
               }
               System.out.println("\nAudio file downloaded locally: downloaded_audio.wav");
           } catch (Exception e) {
               System.out.println("\nError downloading audio file: " + e.getMessage());
           }
       }
       public static void main(String[] args) {
           try {
               // The following is the URL for the Singapore region. If you use a model in the Beijing region, replace the URL with: https://dashscope.aliyuncs.com/api/v1
               Constants.baseHttpApiUrl = "https://dashscope-intl.aliyuncs.com/api/v1";
               call();
           } catch (ApiException | NoApiKeyException | UploadFileException e) {
               System.out.println(e.getMessage());
           }
           System.exit(0);
       }
   }
   ```

## **Instruction control**

Instruction control adjusts speech expressiveness through natural language descriptions. Adjust pitch, speed, emotion, and timbre without manually tuning audio parameters.

**Supported models** : Qwen3-TTS-Instruct-Flash series only.

**Usage** : Set the `instructions` parameter, for example, "Speak at a relatively fast speed with a noticeable rising intonation, suitable for introducing fashion products."

**Supported languages** : Instruction text supports only Chinese and English.

**Length limit** : 1,600 tokens maximum.

**Scenarios** :

* Audiobook and radio drama dubbing
* Advertising and promotional video dubbing
* Game character and animation dubbing
* Emotional intelligent voice assistants
* Documentary and news broadcasting

**How to write high-quality voice descriptions:**

* Core principles:
  
    1. Be specific, not vague: Use words that describe concrete voice characteristics, such as "deep," "crisp," or "fast-paced." Avoid subjective and uninformative terms such as "nice" or "normal."
    2. Be multi-dimensional, not single-dimensional: A good description combines multiple dimensions, such as pitch, speed, and emotion. A single-dimensional description, such as only "high-pitched," is too broad to generate a distinctive effect.
    3. Be objective, not subjective: Focus on the physical and perceptual characteristics of the sound itself, not personal preferences. For example, use "high-pitched and energetic" instead of "my favorite sound."
    4. Be original, not imitative: Describe voice characteristics rather than requesting imitation of a specific person, such as a celebrity or actor. Such requests involve copyright risks and are not supported.
    5. Be concise, not redundant: Ensure every word adds meaning. Avoid repeating synonyms or meaningless intensifiers, such as "a very, very good voice."
* Dimension reference: Combine multiple dimensions for richer expression.
  
  |**Dimension** |**Description example** |
  | --- | --- |
  |Pitch |High, medium, low, high-pitched, low-pitched |
  |Speed |Fast, medium, slow, fast-paced, slow-paced |
  |Emotion |Cheerful, calm, gentle, serious, lively, composed, soothing |
  |Characteristics |Magnetic, crisp, hoarse, mellow, sweet, deep, powerful |
  |Usage |News broadcast, ad voice-over, audiobook, animation character, voice assistant, documentary narration |
* Examples:
  
    + Standard broadcast style: Clear and precise articulation, well-rounded pronunciation.
    + Progressive emotional effect: Volume rapidly increases from normal conversation to a shout, with a straightforward personality and easily excited, expressive emotions.
    + Special emotional state: A sobbing tone causes slightly slurred and hoarse pronunciation, with noticeable tension in the crying voice.
    + Ad voice-over style: High-pitched, medium speed, full of energy and appeal, suitable for ad voice-overs.
    + Gentle and soothing style: Slow-paced, with a gentle and sweet pitch, and a soothing, warm tone, like a caring friend.

## **API reference**

Speech synthesis - Qwen API reference

Voice cloning - API reference

Voice design - API reference

## **Model feature comparison**

|**Features** |**Qwen3-TTS-Instruct-Flash** |**Qwen3-TTS-VD** |**Qwen3-TTS-VC** |**Qwen3-TTS-Flash** |**Qwen-TTS** |
| --- | --- | --- | --- | --- | --- |
|**Supported languages** |Varies by voice : Chinese (Mandarin), English, Spanish, Russian, Italian, French, Korean, Japanese, German, Portuguese |Chinese (Mandarin), English, Spanish, Russian, Italian, French, Korean, Japanese, German, Portuguese |Varies by voice : Chinese (Mandarin, Shanghainese, Beijing dialect, Sichuan dialect, Nanjing dialect, Shaanxi dialect, Southern Min, Tianjin dialect), Cantonese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |Varies by voice : Chinese (Mandarin, Shanghainese, Beijing dialect, Sichuan dialect), English |
|**Audio format** |* wav: for non-streaming output
* pcm: for streaming output, Base64-encoded |
|**Audio sample rate** |24 kHz |
|**Voice cloning** |Not supported |Supported |Not supported |
|**Voice design** |No |Supported |No |
|**SSML** |No |
|**LaTeX** |No |
|**Volume control** |Supported

> Adjustable via instruction control |Not supported |
|**Speech rate control** |Supported

> Adjustable via instruction control |Not supported |
|**Pitch control** |Supported

> Adjustable via instruction control |No |
|**Bitrate control** |No |
|**Timestamp** |No |
|**Instruction control** |Supported |No |
|**Streaming input** |Not supported |
|**Streaming output** |Supported |
|**Rate limiting** |Requests per minute (RPM): 180 |RPM: 180 |RPM: 180 |RPM varies by model:

* qwen3-tts-flash, qwen3-tts-flash-2025-11-27: 180
* qwen3-tts-flash-2025-09-18: 10 |RPM: 10

Tokens per minute (TPM), including input and output tokens: 100,000 |
|**Connection type** |Java/Python SDK, WebSocket API |
|**Pricing** |International: $ 0\.115 /10,000 characters

Chinese mainland: $ 0\.115 /10,000 characters |International: $ 0\.115 /10,000 characters

Chinese mainland: $ 0\.115 /10,000 characters |International: $ 0\.115 /10,000 characters

Chinese mainland: $ 0\.115 /10,000 characters |International: $0.1/10,000 characters

Chinese mainland: $0.114682/10,000 characters |Chinese mainland:

* Input cost: $0.230/1,000 tokens
* Output cost: $1.434/1,000 tokens

Token conversion: 1 second of audio equals 50 tokens. Audio shorter than 1 second counts as 50 tokens. |

## **Supported system voices**

Supported voices vary by model. Set the `voice` request parameter to the corresponding value in the **voice parameter** column of the voice list.

|`**voice**` **parameter** |**Details** |**Supported languages** |**Supported models** |
| --- | --- | --- | --- |
|`Cherry` |**Voice name** : Cherry

**Description** : A sunny, positive, friendly, and natural young woman (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18
* **Qwen-TTS** : qwen-tts, qwen-tts-2025-04-10, qwen-tts-latest, qwen-tts-2025-05-22 |
|`Serena` |**Voice name** : Serena

**Description** : A gentle young woman (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27
* **Qwen-TTS** : qwen-tts, qwen-tts-2025-04-10, qwen-tts-latest, qwen-tts-2025-05-22 |
|`Ethan` |**Voice name** : Ethan

**Description** : Standard Mandarin with a slight northern accent. Sunny, warm, energetic, and vibrant (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18
* **Qwen-TTS** : qwen-tts, qwen-tts-2025-04-10, qwen-tts-latest, qwen-tts-2025-05-22 |
|`Chelsie` |**Voice name** : Chelsie

**Description** : A two-dimensional virtual girlfriend (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27
* **Qwen-TTS** : qwen-tts, qwen-tts-2025-04-10, qwen-tts-latest, qwen-tts-2025-05-22 |
|`Momo` |**Voice name** : Momo

**Description** : Playful and mischievous, cheering you up (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Vivian` |**Voice name** : Vivian

**Description** : Confident, cute, and slightly feisty (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Moon` |**Voice name** : Moon

**Description** : A bold and handsome man named Yuebai (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Maia` |**Voice name** : Maia

**Description** : A blend of intellect and gentleness (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Kai` |**Voice name** : Kai

**Description** : A soothing audio spa for your ears (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Nofish` |**Voice name** : Nofish

**Description** : A designer who cannot pronounce retroflex sounds (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Bella` |**Voice name** : Bella

**Description** : A little girl who drinks but never throws punches when drunk (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Jennifer` |**Voice name** : Jennifer

**Description** : A premium, cinematic-quality American English female voice (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Ryan` |**Voice name** : Ryan

**Description** : Full of rhythm, bursting with dramatic flair, balancing authenticity and tension (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Katerina` |**Voice name** : Katerina

**Description** : A mature-woman voice with rich, memorable rhythm (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Aiden` |**Voice name** : Aiden

**Description** : An American English young man skilled in cooking (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Eldric Sage` |**Voice name** : Eldric Sage

**Description** : A calm and wise elder—weathered like a pine tree, yet clear-minded as a mirror (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Mia` |**Voice name** : Mia

**Description** : Gentle as spring water, obedient as fresh snow (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Mochi` |**Voice name** : Mochi

**Description** : A clever, quick-witted young adult—childlike innocence remains, yet wisdom shines through (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Bellona` |**Voice name** : Bellona

**Description** : A powerful, clear voice that brings characters to life—so stirring it makes your blood boil. With heroic grandeur and perfect diction, this voice captures the full spectrum of human expression. |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Vincent` |**Voice name** : Vincent

**Description** : A uniquely raspy, smoky voice—just one line evokes armies and heroic tales (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Bunny` |**Voice name** : Bunny

**Description** : A little girl overflowing with "cuteness" (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Neil` |**Voice name** : Neil

**Description** : A flat baseline intonation with precise, clear pronunciation—the most professional news anchor (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Elias` |**Voice name** : Elias

**Description** : Maintains academic rigor while using storytelling techniques to turn complex knowledge into digestible learning modules (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Arthur` |**Voice name** : Arthur

**Description** : A simple, earthy voice steeped in time and tobacco smoke—slowly unfolding village stories and curiosities (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Nini` |**Voice name** : Nini

**Description** : A soft, clingy voice like sweet rice cakes—those drawn-out calls of “Big Brother” are so sweet they melt your bones (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Seren` |**Voice name** : Seren

**Description** : A gentle, soothing voice to help you fall asleep faster. Good night, sweet dreams (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Pip` |**Voice name** : Pip

**Description** : A playful, mischievous boy full of childlike wonder—is this your memory of Shin-chan? (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Stella` |**Voice name** : Stella

**Description** : Normally a cloyingly sweet, dazed teenage-girl voice—but when shouting “I represent the moon to defeat you!”, she instantly radiates unwavering love and justice (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Instruct-Flash** : qwen3-tts-instruct-flash, qwen3-tts-instruct-flash-2026-01-26
* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Bodega` |**Voice name** : Bodega

**Description** : A passionate Spanish man (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Sonrisa` |**Voice name** : Sonisa

**Description** : A cheerful, outgoing Latin American woman (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Alek` |**Voice name** : Alek

**Description** : Cold like the Russian spirit, yet warm like wool coat lining (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Dolce` |**Voice name** : Dolce

**Description** : A laid-back Italian man (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Sohee` |**Voice name** : Sohee

**Description** : A warm, cheerful, emotionally expressive Korean unnie (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Ono Anna` |**Voice name** : Ono Anna

**Description** : A clever, spirited childhood friend (female) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Lenn` |**Voice name** : Lenn

**Description** : Rational at heart, rebellious in detail—a German youth who wears suits and listens to post-punk |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Emilien` |**Voice name** : Emilien

**Description** : A romantic French big brother (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Andre` |**Voice name** : Andre

**Description** : A magnetic, natural, and steady male voice |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Radio Gol` |**Voice name** : Radio Gol

**Description** : Football poet Radio Gol! Today I’ll commentate on football using my name (male) |Chinese (Mandarin), English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27 |
|`Jada` |**Voice name** : Shanghai - Jada

**Description** : A fast-paced, energetic Shanghai auntie (female) |Shanghainese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18
* **Qwen-TTS** : qwen-tts-latest, qwen-tts-2025-05-22 |
|`Dylan` |**Voice name** : Beijing - Dylan

**Description** : A young man raised in Beijing’s hutongs (male) |Beijing dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18
* **Qwen-TTS** : qwen-tts-latest, qwen-tts-2025-05-22 |
|`Li` |**Voice name** : Nanjing - Li

**Description** : A patient yoga teacher (male) |Nanjing dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Marcus` |**Voice name** : Shaanxi - Marcus

**Description** : Broad face, few words, sincere heart, deep voice—the authentic Shaanxi flavor (male) |Shaanxi dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Roy` |**Voice name** : Southern Min - Roy

**Description** : A humorous, straightforward, lively Taiwanese guy (male) |Southern Min, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Peter` |**Voice name** : Tianjin - Peter

**Description** : Tianjin-style crosstalk, professional foil (male) |Tianjin dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, and qwen3-tts-flash-2025-09-18 |
|`Sunny` |**Voice name** : Sichuan - Sunny

**Description** : A Sichuan girl sweet enough to melt your heart (female) |Sichuan dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18
* **Qwen-TTS** : qwen-tts-latest, qwen-tts-2025-05-22 |
|`Eric` |**Voice name** : Sichuan - Eric

**Description** : A Sichuanese man from Chengdu who stands out in everyday life (male) |Sichuan dialect, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, qwen3-tts-flash-2025-09-18 |
|`Rocky` |**Voice name** : Cantonese - Rocky

**Description** : A humorous, witty A Qiang providing live chat (male) |Cantonese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, and qwen3-tts-flash-2025-09-18 |
|`Kiki` |**Voice name** : Cantonese - Kiki

**Description** : A sweet Hong Kong girl best friend (female) |Cantonese, English, French, German, Russian, Italian, Spanish, Portuguese, Japanese, Korean |* **Qwen3-TTS-Flash** : qwen3-tts-flash, qwen3-tts-flash-2025-11-27, and qwen3-tts-flash-2025-09-18 |

## **FAQ**

### **Q: How long is the audio file URL valid?**

A: The audio file URL expires after 24 hours.