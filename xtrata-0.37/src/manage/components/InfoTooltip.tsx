type InfoTooltipProps = {
  text: string;
};

export default function InfoTooltip({ text }: InfoTooltipProps) {
  return (
    <span className="info-tooltip" aria-label={text} role="tooltip">
      <span className="info-tooltip__icon" aria-hidden="true">
        i
      </span>
      <span className="info-tooltip__text">{text}</span>
    </span>
  );
}
