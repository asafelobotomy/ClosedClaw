/**
 * Media Constants
 * 
 * Re-exports from centralized constants library.
 * This file is kept for backward compatibility - new code should import
 * directly from '@/config/constants' instead.
 * 
 * @deprecated Import from '@/config/constants' instead
 */

export {
  MAX_IMAGE_BYTES,
  MAX_AUDIO_BYTES,
  MAX_VIDEO_BYTES,
  MAX_DOCUMENT_BYTES,
  mediaKindFromMime,
  maxBytesForKind,
  type MediaKind,
} from "@/config/constants";
