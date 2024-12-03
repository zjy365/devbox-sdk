import { describe, expect, it } from 'vitest';
import { DevBox } from '../src/core/devbox';

const kubeconfig = process.env.KUBECONFIG || '';

describe('DevBox create and operate files', () => {
  it('should create and delete instance', async () => {
    const devbox = await DevBox.create({
      runtime: 'next.js-14-2-5-2024-11-13-0835',
      kubeconfig,
    });

    expect(devbox.id).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 10000));

    const instances = await DevBox.list(kubeconfig);

    expect(instances.length).toBeGreaterThan(0);

    await devbox.delete();
  }, 30000);

  it('should create a new DevBox instance, operate files and start', async () => {
    const devbox = await DevBox.get('devbox', kubeconfig);

    await new Promise((resolve) => setTimeout(resolve, 10000));

    const reuslt1 = await devbox.fileSystem.execCommand([
      'cat',
      '/home/devbox/project/src/app/globals.css',
    ]);

    console.log('result1', reuslt1);
    const result2 = await devbox.fileSystem.execCommand([
      'sh',
      '-c',
      'echo "" > /home/devbox/project/src/app/globals.css',
    ]);
    console.log('result2', result2);

    const result3 = await devbox.fileSystem.writeFile(
      '/home/devbox/project/src/app/page.tsx',
      `export default function Home() {
      return (
        <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
          <div className="container mx-auto px-4 py-16">
            <div className="text-center">
              <h1 className="text-5xl font-bold text-white mb-6">
                首页
              </h1>
              <p className="text-xl text-gray-300 mb-8">
                这是一个使用 Next.js 和 Tailwind CSS 构建的现代化网站
              </p>
              <div className="space-x-4">
                <button className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg transition duration-300">
                  开始使用
                </button>
                <button className="bg-transparent border-2 border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white font-semibold py-2 px-6 rounded-lg transition duration-300">
                  了解更多
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
              {[
                {
                  title: "快速开发",
                  description: "使用最新的技术栈，快速构建现代化应用"
                },
                {
                  title: "响应式设计",
                  description: "完美适配各种设备屏幕尺寸"
                },
                {
                  title: "性能优化",
                  description: "优化加载速度，提供最佳用户体验"
                }
              ].map((feature, index) => (
                <div key={index} className="bg-gray-800 p-6 rounded-lg hover:bg-gray-700 transition duration-300">
                  <h2 className="text-xl font-semibold text-white mb-4">{feature.title}</h2>
                  <p className="text-gray-400">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </main>
      );
    }`,
    );
    console.log('result3:', result3);

    try {
      const result = await devbox.fileSystem.execCommand(['pwd']);
      console.log(result);

      // const stopDevServer = await devbox.fileSystem.execCommand([
      //   'sh',
      //   '-c',
      //   'pkill -9 -f "npm run dev" || true', // 使用 || true 确保即使没有找到进程也不会报错
      // ]);
      // console.log('Stopped dev server:', stopDevServer);

      // const checkProcess = await devbox.fileSystem.execCommand([
      //   'sh',
      //   '-c',
      //   'ps aux | grep "npm run dev" | grep -v grep',
      // ]);
      // console.log('checkProcess', checkProcess);

      const startDevServer = await devbox.fileSystem.execCommand([
        'sh',
        '-c',
        'nohup npm run dev > /tmp/dev.log 2>&1 &',
      ]);
      console.log('Started dev server:', startDevServer);

      // // 等待服务启动
      await new Promise((resolve) => setTimeout(resolve, 3000));
      // 查看日志
      const logs = await devbox.fileSystem.execCommand(['cat', '/tmp/dev.log']);
      console.log('服务日志:', logs);

      // 停止服务
      // const stopServer = await devbox.fileSystem.execCommand([
      //   'sh',
      //   '-c',
      //   'pkill next-server || true && rm -f /tmp/dev.log', // 同时清理日志文件
      // ]);
      // console.log('服务已停止', stopServer);
    } catch (error) {
      console.log(error);
    }

    // await new Promise((resolve) => setTimeout(resolve, 20000));
    // await devbox.delete();
  }, 60000);

  it('should be able to get DevBox instance', async () => {
    const devbox = await DevBox.create({
      runtime: 'next.js-14-2-5-2024-11-13-0835',
      kubeconfig,
    });

    const devbox2 = await DevBox.get(devbox.id, kubeconfig);

    expect(devbox2.id).toBe(devbox.id);

    await new Promise((resolve) => setTimeout(resolve, 10000));

    await devbox.delete();
  }, 30000);
});
