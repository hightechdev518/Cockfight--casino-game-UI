# Live Video Streaming Guide

## ✅ Current Status: YES, Real-Time Video is Supported!

The live panel **CAN** show real-time video streaming. Here's how it works:

---

## How It Currently Works

### 1. **Video Formats Supported**

The component already supports **HLS (HTTP Live Streaming)** - the industry standard for live video:

```typescript
// Line 490 in LiveVideo.tsx
<source src={videoUrl} type={videoUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'} />
```

**Supported Formats**:
- ✅ **HLS (.m3u8)** - Real-time live streaming (preferred)
- ✅ **MP4** - On-demand video files
- ✅ **Any format supported by HTML5 video element**

### 2. **Video URL Sources** (Priority Order)

1. **API Response** (`lobbyinfo.php`):
   - `data.video_url`
   - `data.stream_url`
   - `data.live_url`
   - Table-specific: `data[tableId].video_url`

2. **Constructed HLS Stream**:
   ```typescript
   // Line 88, 112
   `https://vfile.dk77.bet/${tableId}/live.m3u8`
   ```

3. **Constructed Round-Based URL**:
   ```typescript
   // Line 85, 108
   `https://vfile.dk77.bet/${round}.mp4`
   ```

4. **Local Fallback**:
   ```typescript
   // Line 154
   '/videos/example.mp4'
   ```

---

## How to Enable Real-Time Video Streaming

### Option 1: HLS Stream (Recommended - Already Supported!)

**What You Need**:
- Backend provides HLS stream URL ending in `.m3u8`
- Example: `https://vfile.dk77.bet/CF02/live.m3u8`

**How It Works**:
1. Backend streams video to HLS server
2. HLS server creates `.m3u8` playlist file
3. Frontend requests `.m3u8` URL
4. Browser/HLS.js automatically handles chunked streaming
5. Video plays in real-time with adaptive bitrate

**Current Implementation**:
```typescript
// Already implemented in LiveVideo.tsx line 88
videoUrl = `${videoBase}/${tableId}/live.m3u8` // HLS stream
```

**Browser Support**:
- ✅ **Safari**: Native HLS support
- ✅ **Chrome/Edge (newer)**: Native HLS support
- ⚠️ **Firefox/Older browsers**: Need `hls.js` library (see below)

---

### Option 2: Add HLS.js Library (For Better Browser Support)

**Why**: Some browsers (Firefox, older Chrome) don't natively support HLS.

**Installation**:
```bash
npm install hls.js
```

**Implementation** (Update `LiveVideo.tsx`):

```typescript
import Hls from 'hls.js'

// In LiveVideo component
useEffect(() => {
  const video = videoRef.current
  if (!video || !videoUrl) return

  // Check if HLS stream
  if (videoUrl.includes('.m3u8')) {
    // Check if browser supports native HLS
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari, newer Chrome)
      video.src = videoUrl
      video.load()
    } else if (Hls.isSupported()) {
      // Use HLS.js for browsers without native support
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true, // For low latency streaming
        backBufferLength: 90
      })
      
      hls.loadSource(videoUrl)
      hls.attachMedia(video)
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (autoPlay) {
          video.play().catch(console.error)
        }
      })
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('Network error, trying to recover...')
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('Media error, trying to recover...')
              hls.recoverMediaError()
              break
            default:
              console.error('Fatal error, destroying HLS instance')
              hls.destroy()
              setVideoError(true)
              break
          }
        }
      })
      
      return () => {
        hls.destroy()
      }
    } else {
      // Fallback: try native anyway
      video.src = videoUrl
      video.load()
    }
  } else {
    // Regular MP4 or other format
    video.src = videoUrl
    video.load()
  }
  
  if (autoPlay && !videoUrl.includes('.m3u8')) {
    video.play().catch(console.error)
  }
}, [videoUrl, autoPlay])
```

---

### Option 3: WebSocket-Based Video (Advanced)

For ultra-low latency (< 1 second), you could use WebSocket with WebRTC:

**Implementation** (Requires WebRTC server):

```typescript
// Would need WebRTC signaling server
// This is more complex and typically not needed for casino streams
// HLS with low latency mode is usually sufficient
```

---

## Current Video Update Mechanism

### ⚠️ Current: HTTP Polling (10-second delay)

```typescript
// Line 125-137 in LiveVideo.tsx
useEffect(() => {
  fetchVideoUrl()
  
  // Poll every 10 seconds for video URL updates
  const interval = setInterval(() => {
    fetchVideoUrl()
  }, 10000)
  
  return () => clearInterval(interval)
}, [fetchVideoUrl])
```

**Issue**: Video URL updates have up to 10-second delay.

### ✅ Better: WebSocket Push (Real-Time)

**Recommended**: Integrate WebSocket to push video URL updates instantly:

```typescript
// In useWebSocket.ts, add:
case 'video_url_update':
  if (data.payload?.video_url) {
    setLiveVideoUrl(data.payload.video_url)
  }
  break

// In LiveVideo.tsx, subscribe to WebSocket:
useEffect(() => {
  const unsubscribe = useWebSocket().onMessage((data) => {
    if (data.type === 'video_url_update' && data.payload?.video_url) {
      setLiveVideoUrl(data.payload.video_url)
    }
  })
  return unsubscribe
}, [])
```

---

## Video Streaming Architecture

### Current Flow:
```
Backend Video Server (HLS)
    ↓
https://vfile.dk77.bet/{tableId}/live.m3u8
    ↓
Frontend (HTML5 Video + HLS.js)
    ↓
Live Video Display
```

### How HLS Works:
1. **Backend** streams video to HLS server
2. **HLS Server** segments video into small chunks (e.g., 2-10 seconds each)
3. **Playlist file** (`.m3u8`) lists available segments
4. **Browser** requests segments sequentially
5. **Adaptive bitrate**: Automatically adjusts quality based on connection
6. **Real-time**: New segments added continuously

---

## Testing Real-Time Video

### 1. **Test with HLS Stream URL**

If your backend provides an HLS stream, test it:

```typescript
// In browser console or component
const testHlsUrl = 'https://vfile.dk77.bet/CF02/live.m3u8'
// Set this URL and it should stream live
```

### 2. **Check Browser Console**

Look for:
- ✅ `loadeddata` event - Video loaded successfully
- ✅ `play` event - Video playing
- ⚠️ `error` event - Check error details

### 3. **Verify Stream is Live**

- Video should play continuously
- No buffering (if connection is good)
- Updates in real-time as new segments arrive

---

## Requirements for Real-Time Video

### Backend Requirements:
1. ✅ **HLS Server** configured (e.g., NGINX-RTMP, Wowza, AWS MediaLive)
2. ✅ **Stream URL** provided via API (`lobbyinfo.php`)
3. ✅ **CORS** enabled for video domain
4. ✅ **HTTPS** for secure streaming (required by browsers)

### Frontend Requirements:
1. ✅ **HTML5 Video** element (already implemented)
2. ⚠️ **HLS.js library** (recommended for Firefox/older browsers)
3. ✅ **WebSocket** (optional, for instant URL updates)

---

## Recommended Implementation Steps

### Step 1: Verify Backend Provides HLS URL
```bash
# Check if backend returns video_url in lobbyinfo.php
curl -X POST https://apih5.ho8.net/lobbyinfo.php \
  -d "sess_id=YOUR_SESSION&uniqueid=test"
# Look for: video_url, stream_url, or live_url field
```

### Step 2: Install HLS.js (Optional but Recommended)
```bash
npm install hls.js
npm install --save-dev @types/hls.js  # TypeScript types
```

### Step 3: Update LiveVideo Component
Add HLS.js support (code provided above in Option 2)

### Step 4: Test Streaming
1. Get HLS URL from backend
2. Set it in component
3. Verify video plays in real-time

### Step 5: Integrate WebSocket (Optional)
Add WebSocket handler for instant video URL updates (code provided above)

---

## Troubleshooting

### Video Not Playing?

1. **Check CORS**: Video server must allow cross-origin requests
2. **Check HTTPS**: Browsers require HTTPS for secure contexts
3. **Check Format**: Verify URL ends in `.m3u8` for HLS
4. **Check Browser**: Use Safari or newer Chrome for native HLS support
5. **Check Network**: Verify stream URL is accessible

### Video Buffering?

1. **Check Connection**: Slow internet causes buffering
2. **Check HLS Settings**: Adjust `lowLatencyMode` in HLS.js
3. **Check Server**: Video server may be overloaded

### Video URL Not Updating?

1. **Check Polling**: Currently polls every 10 seconds
2. **Check WebSocket**: Integrate WebSocket for instant updates
3. **Check API**: Verify `lobbyinfo.php` returns video URL

---

## Summary

### ✅ YES, Real-Time Video Works!

**Current Capabilities**:
- ✅ Supports HLS streaming (`.m3u8`)
- ✅ Supports MP4 files
- ✅ Auto-plays video
- ✅ Handles errors gracefully
- ✅ Updates video URL (via polling)

**To Improve**:
- ⚠️ Add HLS.js for better browser support
- ⚠️ Integrate WebSocket for instant URL updates
- ⚠️ Reduce polling frequency when WebSocket connected

**What You Need**:
1. Backend provides HLS stream URL (`.m3u8`)
2. Stream URL accessible via HTTPS
3. CORS enabled on video server
4. (Optional) HLS.js library for Firefox support

The foundation is already there - you just need the backend to provide a live HLS stream URL! 🎥

