// 参照画像から中央値でサンプリングした色（照明込みの見た目の色）をもとに、
// ゲーム内のライトで同じ明るさに見えるよう少しだけ暗めに寄せたアルベド。
// 括弧内は参照画像での実測値。
export const PALETTE = {
  skin: 0xf8e2dc, // #fbe5e1 頬 / #f9e5e0 顎
  skinShade: 0xeac3bb,
  blush: 0xf2b5b1, // #f4c3c0
  hair: 0xe1ccc6, // #e8d0c9（明）〜 #d3bcba（中）
  hairDeep: 0xa2847e, // #8b6e6b（毛束の奥の影）
  hairTip: 0xf2e3de,
  earOuter: 0xe9d6d0, // #f2ded8
  earInner: 0xd9a39d, // #d7a8a1
  earFluff: 0xfaf3f0, // #f5ebe7
  coat: 0xefe2db, // #efdfd8
  coatLining: 0xe4d4cc,
  trim: 0xa38681, // #a58884
  strap: 0x7f6866, // #7f6867
  cord: 0x98796f, // #9a7b77
  paw: 0xa98a83, // #b4938b
  metal: 0xb3aaa6,
  undershirt: 0xb59a92,
  tights: 0x645257, // #5a4a4d（トゥーンの暗部で沈むぶん明るめ）
  bootCream: 0xf1e6e1, // #f0e4e1
  bootSole: 0x977d76, // #977d76
  bootCollar: 0xa4857f, // #a4857f
  tail: 0xf0ded8, // #f2e0db
  tailBase: 0xd4b9b1, // #ccaea6
  tailTip: 0xfcf7f4,
  iris: 0x8a5856, // #7c504f 〜 #8f615e
  kraft: 0xc9a476,
  tape: 0xe9dcc4,
};
