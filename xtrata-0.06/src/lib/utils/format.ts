export const truncateMiddle = (value: string, head = 6, tail = 6) => {
  if (value.length <= head + tail + 3) {
    return value;
  }
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

export const formatBytes = (value: bigint) => {
  if (value < 1024n) {
    return `${value.toString()} B`;
  }
  const kilobytes = Number(value) / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`;
  }
  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(2)} MB`;
};
