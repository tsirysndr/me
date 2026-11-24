function Progressbar(props: {
  progress: number;
  class?: string;
}) {
  return (
    <div
      class={`progress-track ${props.class}`}
    >
      <div
        class="progress-fill"
        style={{ width: `${props.progress}%` }}
      >
      </div>
    </div>
  );
}

export default Progressbar;
