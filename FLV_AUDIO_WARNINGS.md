# FLV.js Audio Frame Drop Warnings

## What You're Seeing

If you see console warnings like:
```
▲ [MP4Remuxer] > Dropping 1 audio frame (originalDts: [number] ms, curRefDts: [number] ms) due to dtsCorrection: [negative number] ms overlap.
```

**These are normal and can be safely ignored.**

## What They Mean

1. **Not Errors**: These are informational warnings, not errors. The video will continue playing normally.

2. **Audio Synchronization**: FLV.js uses an MP4Remuxer to convert FLV streams into a format that HTML5 video can play. Sometimes, audio frames need to be dropped to maintain proper synchronization between audio and video tracks.

3. **Common Causes**:
   - Network latency causing timing issues
   - Stream encoding inconsistencies
   - Buffer management adjustments

## Current Mitigation

The application has been configured to:

1. **Enable Stash Buffer**: Changed `enableStashBuffer: true` to reduce frame drops
2. **Console Filtering**: Automatically filters out these warnings in the console (see `src/main.tsx`)
3. **Optimized Buffer Settings**: Configured buffer cleanup and duration settings

## Technical Details

### FLV Player Configuration

```typescript
{
  enableWorker: false,
  enableStashBuffer: true, // Helps reduce frame drops
  stashInitialSize: 128,
  autoCleanupSourceBuffer: true,
  autoCleanupMaxBackwardDuration: 3,
  autoCleanupMinBackwardDuration: 2,
  statisticsInfoReportInterval: 1000
}
```

### When to Worry

You should only be concerned if:
- Video playback stops completely
- Audio is completely out of sync (more than 1-2 seconds)
- You see actual error messages (not warnings)
- The video fails to load

## If Warnings Persist

If you still see many warnings and want to investigate:

1. **Check Network**: Poor network conditions can cause more frame drops
2. **Check Stream Quality**: The source stream might have encoding issues
3. **Browser Console**: Use the filter in DevTools to hide these specific warnings:
   - Open DevTools (F12)
   - Go to Console settings
   - Add filter: `-MP4Remuxer -Dropping -audio frame`

## Related Files

- `src/components/LiveVideo/LiveVideo.tsx` - FLV player configuration
- `src/main.tsx` - Console warning filter

## References

- [FLV.js Documentation](https://github.com/bilibili/flv.js)
- [MP4Remuxer Source](https://github.com/bilibili/flv.js/blob/master/src/remux/mp4-remuxer.js)

