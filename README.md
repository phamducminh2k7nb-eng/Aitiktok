# LiveHost AI v0.3

A lightweight web controller for an AI livestream host.

## Current features
- Browser camera and microphone preview
- Avatar image upload
- Vietnamese browser TTS
- Comment queue with human approval before speech
- Local reply fallback that avoids inventing product facts
- Optional OpenAI-compatible AI reply backend via environment variables
- Product context fields for safer answers
- WebSocket control channel
- Remote avatar/GPU adapter placeholder
- OBS Browser Source mode: open the public URL with `?obs=1`
- Docker + Railway deployment

## AI configuration
Set these as Railway service variables, not in GitHub:

```env
AI_API_URL=
AI_API_KEY=
AI_MODEL=
```

If they are empty, LiveHost uses the local rule-based fallback.

## Avatar engine
Set:

```env
AVATAR_ENGINE_URL=https://your-gpu-avatar-server.example
```

The current public app does not bundle PersonaLive or another GPU model.

## TikTok LIVE comments
The production server intentionally does not embed an unofficial reverse-engineered TikTok LIVE reader. The UI/backend are ready for a connector, but real LIVE comments should be supplied through an approved TikTok integration or a separate local connector you control.

## OBS
Open:

```
https://YOUR_DOMAIN/?obs=1
```

and add that URL as an OBS Browser Source.
