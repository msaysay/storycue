"use client";

import { memo, useId, type CSSProperties } from "react";

const CONTOUR = "M95 63L129 44H191L225 63L240 113L224 207L187 252H133L96 207L80 113Z";
const NODES = [[129,44],[191,44],[95,63],[225,63],[121,93],[199,93],[104,128],[216,128],[112,186],[208,186],[133,213],[187,213],[160,177]];

/** Original holographic face. Mouth follows audio energy, not phoneme lip sync. */
export const RobotFace = memo(function RobotFace() {
  const id = useId();
  return <div className="sc-robot-shell"><svg className="sc-robot-face" viewBox="0 0 320 320" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-mask`} x1="90" y1="45" x2="215" y2="260" gradientUnits="userSpaceOnUse"><stop stopColor="#14384b" stopOpacity=".88" /><stop offset=".5" stopColor="#071621" stopOpacity=".92" /><stop offset="1" stopColor="#164050" stopOpacity=".7" /></linearGradient>
      <linearGradient id={`${id}-light`} x1="95" y1="60" x2="225" y2="250" gradientUnits="userSpaceOnUse"><stop stopColor="#beffff" /><stop offset=".35" stopColor="#54d9ef" /><stop offset=".7" stopColor="#2b697f" /><stop offset="1" stopColor="#9bf7ff" /></linearGradient>
      <linearGradient id={`${id}-scan`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#8ff9ff" stopOpacity="0" /><stop offset="1" stopColor="#8ff9ff" stopOpacity=".35" /></linearGradient>
      <clipPath id={`${id}-clip`}><path d={CONTOUR} /></clipPath>
    </defs>
    <g className="sc-face-backplane"><path d="M87 53L125 30H195L233 53L255 112L237 214L192 267H128L83 214L65 112Z" /><path d="M160 19V35M160 267V286M55 117H72M248 117H265" /></g>
    <path className="sc-face-contour" d={CONTOUR} fill={`url(#${id}-mask)`} stroke={`url(#${id}-light)`} pathLength="1" />
    <g clipPath={`url(#${id}-clip)`}>
      <path className="sc-face-facet" d="M95 63L121 93L104 128L80 113ZM225 63L199 93L216 128L240 113ZM112 186L133 213V252L96 207ZM208 186L187 213V252L224 207Z" />
      <g className="sc-face-mesh">{Array.from({length:12}, (_,i) => <path key={i} d={`M80 ${63+i*16}H240`} />)}<path d="M129 44L104 128L133 213L160 252L187 213L216 128L191 44M160 44V252M95 63L216 128L112 186L187 252M225 63L104 128L208 186L133 252M121 93H199M112 186H208" /></g>
      <g className="sc-face-scan-volume"><rect x="75" y="40" width="170" height="34" fill={`url(#${id}-scan)`} /><path d="M75 74H245" /></g>
    </g>
    <path className="sc-face-panel" d="M95 63L121 93H199L225 63M80 113L104 128L112 186L133 213H187L208 186L216 128L240 113M133 213V252M187 213V252M117 101L127 113H193L203 101M143 159L136 180H184L177 159" />
    <path className="sc-face-circuit" d="M92 114L103 105V82M228 114L217 105V82M107 167L118 175V190L133 201M213 167L202 175V190L187 201M149 226H171L178 219" />
    <g className="sc-face-eyes"><g className="sc-eye-gaze"><path className="sc-eye-track" d="M103 127L138 134M182 134L217 127" /><path className="sc-eye-light" d="M106 126L137 132M183 132L214 126" /><path className="sc-eye-detail" d="M109 127L116 129M204 129L211 127" /></g></g>
    <path className="sc-face-nose" d="M160 140L151 165H169L160 140Z" />
    <g className="sc-face-mouth">{Array.from({ length: 15 }, (_, i) => <rect key={i} className="sc-mouth-bar" x={126+i*4.6} y={199} width="2.3" height={4+Math.sin(i*.85)**2*5} rx="1.1" style={{ "--mouth-shape": .5+Math.sin(i*.85)**2, transformOrigin:`${127.15+i*4.6}px 202.5px` } as CSSProperties} />)}</g>
    <g className="sc-face-nodes">{NODES.map(([x,y],i) => <circle key={i} cx={x} cy={y} r="1.7" style={{animationDelay:`${i*-230}ms`}} />)}</g>
    <g className="sc-face-ear"><path d="M64 107V159M256 107V159" /><path className="sc-ear-detail" d="M57 116V150M263 116V150" /></g>
    <path className="sc-face-sign" d="M166 60H158L153 65V70H161L166 75H158M166 67L169 70" />
  </svg></div>;
});
