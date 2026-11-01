/** 程序化混响脉冲：指数衰减的立体声噪声（文档 §5.6，2.8s） */
export function makeImpulse(ctx: BaseAudioContext, seconds = 2.8, decay = 3.2): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let s = 12345 + ch * 777;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      const n = (s / 4294967296) * 2 - 1;
      const t = i / len;
      // 前 8ms 稍弱，模拟早期反射到混响尾的过渡
      const pre = i < rate * 0.008 ? i / (rate * 0.008) : 1;
      d[i] = n * Math.pow(1 - t, decay) * pre;
    }
  }
  return buf;
}
