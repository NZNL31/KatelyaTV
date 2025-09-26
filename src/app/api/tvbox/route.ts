import { NextRequest, NextResponse } from 'next/server';

// 强制使用 Edge Runtime
export const runtime = 'edge';

// TVBox源格式接口
interface TVBoxSource {
  key: string;
  name: string;
  type: number; // 0=影视源, 1=直播源, 3=解析源
  api: string;
  searchable?: number;
  quickSearch?: number;
  filterable?: number;
  ext?: string;
  jar?: string;
  playUrl?: string;
  categories?: string[];
  timeout?: number;
}

interface TVBoxConfig {
  spider?: string; // 爬虫jar包地址
  wallpaper?: string; // 壁纸地址
  lives?: Array<{
    name: string;
    type: number;
    url: string;
    epg?: string;
    logo?: string;
  }>;
  sites: TVBoxSource[];
  parses?: Array<{
    name: string;
    type: number;
    url: string;
    ext?: Record<string, unknown>;
    header?: Record<string, string>;
  }>;
  flags?: string[];
  ijk?: Record<string, unknown>;
  ads?: string[];
}

// ====== 本地影视源 ======
const localSources: TVBoxSource[] = [
  {
    key: 'local-movie',
    name: '本地影视源',
    type: 1,
    api: '', // 绝对不访问远程
    searchable: 1,
    quickSearch: 1,
    filterable: 1,
    timeout: 30,
    categories: ["电影", "电视剧", "综艺", "动漫", "纪录片", "短剧"]
  }
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const baseUrl = `${protocol}://${host}`;

    // 构造完整 TVBox 配置
    const tvboxConfig: TVBoxConfig = {
      spider: '', // 本地不使用爬虫
      wallpaper: `${baseUrl}/screenshot1.png`,
      sites: localSources,
      parses: [
        { name: "本地Json并发", type: 2, url: "" },
        { name: "本地Json轮询", type: 2, url: "" },
        {
          name: "本地内置解析",
          type: 1,
          url: "",
          ext: {
            flag: [
              "qiyi","qq","letv","sohu","youku","mgtv",
              "bilibili","wasu","xigua","1905"
            ]
          }
        }
      ],
      flags: [
        "本地","youku","qq","iqiyi","qiyi","letv",
        "sohu","bilibili","le","duoduozy","renrenmi",
        "xigua","优酷","腾讯","爱奇艺","奇艺","乐视",
        "搜狐","土豆","PPTV","芒果","华数","哔哩","1905"
      ],
      lives: [
        { name: "本地直播", type: 0, url: "", epg: "", logo: "" }
      ],
      ads: [] // 完全移除广告
    };

    // 不管 json 还是 txt，都返回 Base64，前端安全使用
    const configStr = JSON.stringify(tvboxConfig, null, 2);
    const base64Config = Buffer.from(configStr).toString('base64');

    return new NextResponse(base64Config, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'TVBox本地配置生成失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// 支持CORS预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
