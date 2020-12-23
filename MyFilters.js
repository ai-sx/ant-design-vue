/**
 * 文本长度过滤器
 * @param - val 默认为当前过滤对象值
 * @param len 过滤长度，默认为10
 * @param suffix 字符串后缀，默认'...'
 * @returns {string}
 */
export function textFilter (val, len = 10, suffix = '...') {
  if (!val && val !== 0) {
    return ''
  } else if (typeof val !== 'string') {
    return textFilter(String(val), len)
  } else if (val.length <= len) {
    return val
  } else {
    return val.substr(0, len).concat(suffix)
  }
}
