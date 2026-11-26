// A shader layer: the body of a fragment shader (Shadertoy style: mainImage(out vec4 fragColor, in vec2 fragCoord), with iResolution, iTime and iProgress) is run on a WebGL canvas
// and drawn as a picture. The idea comes from editly's gl layers (a fragment shader per layer); written fresh. Loops in WebGL 1 shaders must have constant bounds, so a shader cannot
// run for ever, and the source is limited in length by the description's checks.
const VERTEX = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const wrapFragment = (body: string) => `precision highp float;
uniform vec3 iResolution;
uniform float iTime;
uniform float iProgress;
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
${body}
}
void main() { vec4 c = vec4(0.0); mainImage(c, gl_FragCoord.xy); gl_FragColor = c; }`;

export class ShaderRunner {
  readonly canvas: OffscreenCanvas;
  readonly #gl: WebGLRenderingContext;
  readonly #programs = new Map<string, { program: WebGLProgram; time: WebGLUniformLocation | null; progress: WebGLUniformLocation | null; resolution: WebGLUniformLocation | null }>();

  constructor(width: number, height: number) {
    this.canvas = new OffscreenCanvas(width, height);
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true }) as WebGLRenderingContext | null;
    if (!gl) throw new Error('this browser gave no WebGL context, so a shader layer cannot be drawn');
    this.#gl = gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  }

  #compile(body: string) {
    const known = this.#programs.get(body);
    if (known) return known;
    const gl = this.#gl;
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`the shader does not compile: ${(gl.getShaderInfoLog(s) ?? '').split('\n').filter(Boolean).slice(0, 3).join(' | ')}`);
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, wrapFragment(body)));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`the shader does not link: ${gl.getProgramInfoLog(program) ?? ''}`);
    const entry = { program, time: gl.getUniformLocation(program, 'iTime'), progress: gl.getUniformLocation(program, 'iProgress'), resolution: gl.getUniformLocation(program, 'iResolution') };
    this.#programs.set(body, entry);
    return entry;
  }

  /** Draws the shader at `time` seconds (already scaled by the layer's speed) and `progress` (0 to 1 through the layer) and returns the canvas it drew on. */
  render(body: string, time: number, progress: number): OffscreenCanvas {
    const gl = this.#gl;
    const p = this.#compile(body);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(p.program);
    const loc = gl.getAttribLocation(p.program, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3f(p.resolution, this.canvas.width, this.canvas.height, 1);
    gl.uniform1f(p.time, time);
    gl.uniform1f(p.progress, progress);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }
}
