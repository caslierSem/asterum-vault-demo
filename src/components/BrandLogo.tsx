import { useState } from 'react';
import { Library } from 'lucide-react';

export default function BrandLogo() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-700 text-white">
        <Library className="h-5 w-5" />
      </div>
    );
  }

  return (
    // 外层容器用来锁定官方的比例（宽/高）和大小
    <div className="relative block w-12 lg:w-14 aspect-[288/208]">
      <img
        src="/logo.png"
        alt="Plave logo"
        onError={() => setFailed(true)}
        // h-full w-full 让图片填满容器，object-contain 保证不变形
        // style 里的 filter: 'invert(1)' 就是官网用来把颜色反转的魔法
        className="h-full w-full object-contain"
        style={{ filter: 'invert(1)' }}
      />
    </div>
  );
}