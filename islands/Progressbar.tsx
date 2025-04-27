function Progressbar(props: {
  progress: number;
  class?: string;
}) {
  return (
    <div
      class={`w-full h-[4px] bg-[rgba(109,109,156,0.3)] rounded-[10px] ${props.class}`}
    >
      <div
        class="h-full bg-[#ff5dae] rounded-[10px] transition-all duration-300 ease-in-out"
        style={{ width: `${props.progress}%` }}
      >
      </div>
    </div>
  );
}

export default Progressbar;
