import { describe, expect, it } from "vitest";
import { markFeedReadInCache, removeFeedsFromCache } from "./feed-cache";
import type { FeedItem } from "../api/feeds";

const item = (id: string, isRead = false): FeedItem =>
  ({ id, title: `标题${id}`, isRead, link: `https://example.com/${id}` }) as FeedItem;

describe("markFeedReadInCache", () => {
  it("命中 id 置为已读，其余原样", () => {
    const list = [item("a"), item("b")];
    const updated = markFeedReadInCache(list, "a");
    expect(updated[0]?.isRead).toBe(true);
    expect(updated[1]?.isRead).toBe(false);
    // 不可变：原列表不受影响
    expect(list[0]?.isRead).toBe(false);
  });

  it("未命中时返回等长原列表", () => {
    const list = [item("a")];
    expect(markFeedReadInCache(list, "nope")).toHaveLength(1);
  });
});

describe("removeFeedsFromCache", () => {
  it("移除命中的多个条目", () => {
    const list = [item("a"), item("b"), item("c")];
    expect(removeFeedsFromCache(list, ["a", "c"]).map((f) => f.id)).toEqual(["b"]);
  });

  it("空列表安全", () => {
    expect(removeFeedsFromCache([], ["a"])).toHaveLength(0);
  });
});
