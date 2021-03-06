import moment from 'moment'
import { textFilter } from './MyFilters'

/**
 * 输出列
 * strategy ： [index,action]
 * extraProperty : [default,requiredHeader,ellipses,format]
 * @param * title => title
 * @param * col => dataIndex, key
 * @param scope => scopedSlots,当为true时代表自定义处理，false代表原生处理，不写将对字段特殊处理
 * @param others => {} 其余属性
 * @returns {{title: *, dataIndex: *, key: *}}
 */
export function T (title, col, scope, others = {}) {
  const obj = {
    title: title,
    align: 'center',
    dataIndex: col,
    key: col,
    scope
  }
  // 执行特殊字段处理策略
  const strategy = strategyFactory.getStrategy(obj)
  // 执行策略
  strategy.doOperation()
  // 非空策略将不会再进行任何其他处理
  if (!strategy.isNull()) {
    delete obj.scope
    return obj
  }
  // 对额外属性进行装饰处理
  return ExtraPropertyHandle.handle(Object.assign(obj, others))
}

/**
 * 可编辑的列
 * @param title 表头
 * @param col 列名
 * @param others => {} 其余属性
 * @returns {{[p: string]: *}}
 * @constructor
 */
export function Edit (title, col, others = {}) {
  const obj = {
    title,
    dataIndex: col,
    align: 'center',
    scopedSlots: { customRender: col }
  }
  // 对额外属性进行装饰处理
  return ExtraPropertyHandle.handle(Object.assign(obj, others))
}

/**
 * 处理策略父类
 * isNull() 判断策略是否为空
 * doOperation() 策略子类执行的具体操作
 */
class Strategy {
  constructor (obj) {
    this.obj = obj
  }
  doOperation () {}
  isNull () {
    return false
  }
}

/**
 * 序号处理策略 => 自增
 */
class IndexStrategy extends Strategy {
  doOperation () {
    this.obj.customRender = (text, record, index) => index + 1
  }
}

/**
 * 操作处理策略 => 左对齐+右侧固定+自定义处理
 */
class ActionStrategy extends Strategy {
  doOperation () {
    this.obj.align = 'left'
    this.obj.scopedSlots = { customRender: this.obj.dataIndex }
  }
}

/**
 *  空策略 => 判断是否自定义处理
 */
class NullStrategy extends Strategy {
  doOperation () {
    if (this.obj.scope) {
      this.obj.scopedSlots = { customRender: this.obj.dataIndex }
    }
    delete this.obj.scope
  }
  isNull () {
    return true
  }
}

/**
 * 策略工厂
 */
class strategyFactory {
  /**
   * 获取策略对象
   * @param obj 处理对象
   * @returns {Strategy} 对应处理策略
   */
  static getStrategy (obj) {
    // 判断是否需要处理
    if (obj.scope === undefined) {
      // 获取处理策略
      switch (obj.dataIndex) {
        case 'index':
          return new IndexStrategy(obj)
        case 'action':
          return new ActionStrategy(obj)
        default :
      }
    }
    return new NullStrategy(obj)
  }
}

/**
 * 额外属性父类
 * action额外属性操作，你应该避免在函数内的函数中使用others对象
 * 那样可能会使others对象使用后无法被垃圾回收，正确的做法是使用局部变量,并在最后释放引用
 */
class ExtraProperty {
  action (others) {}
}

/**
 * 额外属性基本类
 */
class ConcreteExtraProperty extends ExtraProperty {
  action (others) {
    // 基本（公共）操作
  }
}

/**
 * 额外属性装饰器
 */
class Decorate extends ExtraProperty {
  constructor (ExtraProperty) {
    super()
    this.ExtraProperty = ExtraProperty
  }
  action (others) {
    this.ExtraProperty.action(others)
  }
}

/**
 * 默认值额外属性装饰器
 */
class DefaultDecorate extends Decorate {
  action (others) {
    // 执行内部装饰处理
    super.action(others)
    // 如果已经对内容进行了处理，就不再设置默认值
    if (others.customRender) return
    const value = others['default']
    // 为当前列添加默认值
    others.customRender = text => {
      return text || value
    }
    others = null
  }
}

/**
 * 表头必填额外属性装饰器 => 添加一个动态class属性requiredHeader
 */
class RequiredHeaderDecorate extends Decorate {
  action (others) {
    // 执行内部装饰处理
    super.action(others)
    const value = others['requiredHeader']
    const title = others['title']
    // 为当前列添加表头必填
    others.customHeaderCell = columns => {
      return {
        // 'class': { requiredHeader: value }
        // <span style='color:red'>*</span>${title}
        domProps: {
          innerHTML: `<span class="${value ? 'requiredHeader' : ''}">${title}</span>`
        }
      }
    }
    others = null
  }
}

/**
 * 内容省略额外属性装饰器 => 你可以设置boolean和number两种值,版本允许可以使用官方的ellipsis
 *  当为boolean将会根据内容宽度省略
 *  当为数字时将会根据传入的值来截取
 */
class EllipsesDecorate extends Decorate {
  action (others) {
    super.action(others)
    const value = others['ellipses']
    const defaultValue = others['default']
    const dataIndex = others['dataIndex']
    others.customCell = (record, rowIndex) => {
      const columnRender = {}
      if (typeof value === 'boolean') {
        if (value) {
          columnRender.style = { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }
          columnRender.attrs = { title: record[dataIndex] }
        }
      } else {
        if (isNaN(Number(value))) {
          throw new TypeError('[T: ExtraProperty] ellipses value must be a boolean or legal number or numeric string')
        } else {
          record[dataIndex] = record[dataIndex] || defaultValue
          columnRender.attrs = { title: record[dataIndex] }
          columnRender.domProps = {
            innerHTML: `${textFilter(record[dataIndex], Number(value))}`
          }
        }
      }
      return columnRender
    }
    others = null
  }
}

/**
 * 格式化额外属性装饰器 => 目前只支持日期,你应该保证你的字段符合日期格式
 */
class DateFormatDecorate extends Decorate {
  action (others) {
    // 执行内部装饰处理
    super.action(others)
    const value = others['format']
    // 为当前列添加默认值
    others.customRender = text => {
      text = moment(text).format(value)
      if (text === 'Invalid date') {
        throw new TypeError('[T: ExtraProperty] Invalid date')
      }
      return text
    }
    others = null
  }
}
/**
 * 待定 OptionsDecorate 只有'0'和'1'选择项时额外属性装饰器,更多选项应该使用字典
 */

/**
 * 额外属性装饰器工厂
 */
class ExtraPropertyFactory {
  static getExtraProperty (propertyName) {
    switch (propertyName) {
      case 'default':return DefaultDecorate
      case 'requiredHeader':return RequiredHeaderDecorate
      case 'ellipses':return EllipsesDecorate
      case 'format':return DateFormatDecorate
      default:
    }
  }
}

/**
 * 额外属性处理类
 */
class ExtraPropertyHandle {
  /**
   * 对属性集合中的额外属性进行处理
   * @param others 属性集合
   * @returns {*}
   */
  static handle (others) {
    const keys = Object.keys(others)
    // 额外属性基本类
    let extraProperty
    // 记录所有额外属性
    let existKey
    keys.forEach(key => {
      const DecorateClass = ExtraPropertyFactory.getExtraProperty(key)
      if (DecorateClass) {
        // 延迟创建
        if (!extraProperty) extraProperty = new ConcreteExtraProperty()
        if (!existKey) existKey = []
        existKey.push(key)
        // 对额外属性进行装饰
        extraProperty = new DecorateClass(extraProperty)
      }
    })
    // 执行各个处理器的装饰
    extraProperty && extraProperty.action(others)
    // 删除所有额外属性
    existKey && existKey.forEach(i => delete others[i])
    return others
  }
}
