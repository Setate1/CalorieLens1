import React from "react";

export const AmbientBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none z-[-1] bg-[#F3F3F5] dark:bg-[#050505] transition-colors duration-500 m-0 p-0">
      {/* Subtle blue/navy ambient blobs */}
      <div className="absolute -top-[10%] -left-[10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] rounded-full bg-blue-400/20 dark:bg-[#1e3a8a] blur-[100px] dark:opacity-40 animate-ambient-blob" />
      <div className="absolute top-[35%] -right-[10%] w-[50vw] h-[50vw] max-w-[500px] max-h-[500px] rounded-full bg-indigo-400/15 dark:bg-[#312e81] blur-[120px] dark:opacity-30 animate-ambient-blob animation-delay-2000" />
      <div className="absolute -bottom-[10%] left-[15%] w-[70vw] h-[70vw] max-w-[700px] max-h-[700px] rounded-full bg-sky-400/20 dark:bg-[#0c4a6e] blur-[110px] dark:opacity-40 animate-ambient-blob animation-delay-4000" />
      
      {/* Optional ultra-subtle noise overlay for premium feel */}
      <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay bg-noise pointer-events-none" />
    </div>
  );
};
