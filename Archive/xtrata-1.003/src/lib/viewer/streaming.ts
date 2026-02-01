export type StreamPhase =
  | 'idle'
  | 'buffering'
  | 'playable'
  | 'loading'
  | 'complete'
  | 'error';

export const shouldAllowTokenUriPreview = (params: {
  hasMeta: boolean;
  contentError: boolean;
  streamPhase: StreamPhase;
  hasPreviewContent: boolean;
  shouldStream: boolean;
}) => {
  if (!params.hasMeta) {
    return true;
  }
  if (params.contentError) {
    return true;
  }
  if (params.streamPhase === 'error') {
    return true;
  }
  if (!params.hasPreviewContent && !params.shouldStream) {
    return true;
  }
  return false;
};
