"""把生成的背景音乐剪成无缝循环：python3 scripts/loopify.py <输入.mp3> <输出.m4a> [交叉淡化秒数=2]

1. 解码成 44.1kHz 立体声（ffmpeg）。
2. 找结尾：从后往前，第一个 1 秒窗口响度回到全曲中位数 −6dB 以内的位置，之后的收尾/静音都不要。
3. 估节拍：10ms 响度包络的起音强度做自相关，在 0.35–1.2 秒里找拍长，一小节按 4 拍算。
4. 循环长度取从开头算起的整数小节，不超过结尾；最后 F 秒和开头 F 秒等功率交叉淡化，
   输出从第 F 秒开始，所以文件尾接回文件头时正好对上。
5. 编码成 AAC（m4a，96kbps）。
"""
import math
import struct
import subprocess
import sys

src, dst = sys.argv[1], sys.argv[2]
F = float(sys.argv[3]) if len(sys.argv) > 3 else 2.0
SR = 44100

raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-f', 's16le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
n = len(raw) // 4
pcm = struct.unpack('<%dh' % (n * 2), raw[: n * 4])
L = pcm[0::2]
R = pcm[1::2]

# 10ms 响度包络
hop = SR // 100
env = []
for i in range(0, n - hop, hop):
    s = 0
    for j in range(i, i + hop, 4):
        v = L[j] + R[j]
        s += v * v
    env.append(math.sqrt(s / (hop / 4)) + 1e-9)
db = [20 * math.log10(e / 65536) for e in env]
med = sorted(db)[len(db) // 2]

# 结尾：从后往前找 1 秒窗口平均响度 ≥ 中位数 − 6dB
end = len(db)
for k in range(len(db) - 100, 0, -10):
    if sum(db[k : k + 100]) / 100 >= med - 6:
        end = k + 100
        break
end_s = end / 100

# 节拍
onset = [max(0.0, env[i] - env[i - 1]) for i in range(1, len(env))]
best, beat = -1.0, 0.6
for lag in range(35, 121):
    c = sum(onset[i] * onset[i + lag] for i in range(0, len(onset) - lag))
    if c > best:
        best, beat = c, lag / 100
bar = beat * 4
bars = int((end_s - 0.05) // bar)
loop_end = bars * bar  # 秒；开头 0 秒算作一小节的起点
print(f'{src}: 时长 {n / SR:.1f}s  中位响度 {med:.0f}dB  结尾 {end_s:.1f}s  拍长 {beat:.2f}s（{60 / beat:.0f} BPM）  循环 {bars} 小节 = {loop_end:.1f}s')

# 交叉淡化：输出 = [F, loop_end)，其中最后 F 秒混入开头 [0, F)
a, b = int(F * SR), int(loop_end * SR)
out = bytearray()
for i in range(a, b):
    l, r = L[i], R[i]
    k = i - (b - a)  # 落在最后 F 秒时，对应开头的位置
    if k >= 0:
        t = k / a
        g_out, g_in = math.cos(t * math.pi / 2), math.sin(t * math.pi / 2)
        l = l * g_out + L[k] * g_in
        r = r * g_out + R[k] * g_in
    out += struct.pack('<hh', max(-32768, min(32767, int(l))), max(-32768, min(32767, int(r))))

subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ac', '2', '-ar', str(SR), '-i', '-', '-c:a', 'aac', '-b:a', '96k', dst], input=bytes(out), check=True)
print(dst, f'{(b - a) / SR:.1f}s')
