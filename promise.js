const ENUM = {
    PENDING: 'Pendding',
    FULFILLED: 'Fullfuilled',
    REJECTED: 'Rejected'
}

//需要兼容其他人写的promise
const resolvePromise = (x, promise2, resolve, reject) => {
    // 解析x，判断x的值来解析promise2是成功还是失败或者是一个promise

    // x和promise2引用的是同一个对象时，会死循环，所以报类型错误
    if (x === promise2) {
        reject(new TypeError('TypeError: Chaining cycle detected for promise #<Promise>'))
    }

    // 如果x是一个promise，那么就采用它的状态

    if ((typeof x === 'object' && x !== null) || typeof x === 'function') {
        // x是一个对象或者是一个函数
        // 这里解析的x可能是其他人写的promise
        let called  // called用来防止多次调用或同时调用成功和失败
        try {
            let then = x.then   // 取出then方法
            if (typeof then === 'function') {
                // 就是promise，因为所有的promise都有then方法
                // x.then()会再次取一次then，再次取一次又会执行一次defineProperty的get()，有可能第二次取值会报错
                // 因此直接复用上次取到的then方法，并且让then方法的this仍然指向x
                then.call(x, y => {
                    // 成功的回调
                    if (called) return
                    called = true
                    // 这里的y可能也是一个promise
                    // 递归解析y的值，直到结果是一个普通值为止，将结果作为promise2的成功或失败
                    resolvePromise(y, promise2, resolve, reject)
                }, r => {
                    // 失败的回调
                    if (called) return
                    called = true
                    // 一旦失败直接失败，不会进行解析判断是否为promise
                    reject(r)
                })
            } else {
                // 普通对象，不是promise
                resolve(x)
            }
        } catch (error) {
            // 当用Object.defineProperty定义对象的then方法的get()时抛出错误
            if (called) return
            called = true
            reject(error)
        }
    } else {
        // 普通值
        resolve(x)  // 直接成功即可
    }
}

class Promise {
    constructor(executor) {
        this.status = ENUM.PENDING  // 开始状态为pendding
        this.value = undefined  // 成功后的值
        this.reason = undefined // 失败的原因
        // 使用发布订阅模式，
        // promise可以多次调用then，promise的状态只能是单向改变
        // 在改变时调用相应队列里的方法，也就是发布出去
        // 队列里的方法是订阅的，该promise调用了几次then就订阅几次
        // 发布订阅模式的优点是发布和订阅没有关系，订阅了的内容不确定什么时候发布
        this.onResolvedCallbacks = []   // 成功的队列
        this.onRejectedCallbacks = []   // 失败的队列
        const resolve = (value) => {
            // 如果value是一个promise，那应该实现一个递归解析
            if (value instanceof Promise) {
                // 递归解析，直到value是个普通值
                return value.then(resolve, reject)
            }

            if (this.status === ENUM.PENDING) { // 只有pendding才能改变状态
                this.status = ENUM.FULFILLED
                this.value = value
                this.onResolvedCallbacks.forEach(fn => fn())
            }
        }
        const reject = (reason) => {
            if (this.status === ENUM.PENDING) { // 只有pendding才能改变状态
                this.status = ENUM.REJECTED
                this.reason = reason
                this.onRejectedCallbacks.forEach(fn => fn())
            }
        }
        // onFulfilled和onRejected的异常捕获在这不会执行，因为onFulfilled和onRejected被包装成异步了
        try {
            executor(resolve, reject) // 立即执行
        } catch (error) {
            // 发生异常状态变为reject
            reject(error)
        }
    }
    then(onFulfilled, onRejected) {
        // then中的两个参数是可选的，且会发生值穿透，所以需要进行判断，当参数不是函数时，需要赋一个默认函数
        onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : v => v
        onRejected = typeof onRejected === 'function' ? onRejected : err => { throw err }
        // 调用then后会返回一个新的promise，使用递归实现
        // 新的promise的状态由前一个promise执行后返回的x决定
        let promise2 = new Promise((resolve, reject) => {
            // 把这段代码写到promise2里的原因：
            // 1.新的promise的状态需要由x决定，放在外面的话这里访问不到x
            // 2.promise里的executor会立即执行，因此放到这里和外面效果一样

            // 根据状态选择执行，这里的this指向前一个promise
            if (this.status == ENUM.FULFILLED) {
                // onFulfilled和onRejected不能在当前执行上下文中调用，这个方法必须是异步的
                // 因为resolvePromise需要promise2实例化完才能拿到，因此需要用异步包装起来
                // 因为异步的这部分代码在同步代码执行完毕后执行，也就是promise2实例化后执行，因此能拿到该实例
                setTimeout(() => {
                    try {
                        let x = onFulfilled(this.value)
                        resolvePromise(x, promise2, resolve, reject)
                    } catch (error) {
                        reject(error)
                    }
                }, 0)
            }
            if (this.status == ENUM.REJECTED) {
                setTimeout(() => {
                    try {
                        let x = onRejected(this.reason)
                        resolvePromise(x, promise2, resolve, reject)
                    } catch (error) {
                        reject(error)
                    }
                }, 0)
            }
            if (this.status == ENUM.PENDING) {
                // 用户没有调用resolve或reject方法
                // 处理异步，当状态改变时将相应状态队列里的方法全部执行
                // 用另一个函数对要执行函数进行包装，也就是面向切面编程（AOP）
                this.onResolvedCallbacks.push(() => {
                    // todo...
                    // 这里其实不用加定时器，因为这里的onFulfilled和下面的onRejected一定是异步的
                    setTimeout(() => {
                        try {
                            let x = onFulfilled(this.value)
                            resolvePromise(x, promise2, resolve, reject)
                        } catch (error) {
                            reject(error)
                        }
                    }, 0)
                })
                this.onRejectedCallbacks.push(() => {
                    // todo...
                    setTimeout(() => {
                        try {
                            let x = onRejected(this.reason)
                            resolvePromise(x, promise2, resolve, reject)
                        } catch (error) {
                            reject(error)
                        }
                    }, 0)
                })
            }
        })
        return promise2
    }
    static catch(errCallback) {
        // catch相当于没有成功回调的then
        return this.then(null, errCallback)
    }
    static resolve(val) {
        // 默认产生一个成功的promise
        return new Promise((resolve, reject) => {
            resolve(val)
        })
    }
    static reject(reason) {
        // 默认产生一个失败的promise
        return new Promise((resolve, reject) => {
            reject(reason)
        })
    }
    finally(callback) {
        // finally返回的是一个then()
        // 无论上一次的结果是否成功，都会执行callback
        // 如果返回的是一个promise，会等待promise执行完毕，因此用Promise.resolve()
        return this.then(value => {
            // 如果返回的是成功的promise，会采用上一次的结果
            return Promise.resolve(callback()).then(() => value)
        }, err => {
            // 返回的是失败的promise，会把这个失败的结果返回回去
            return Promise.resolve(callback()).then(() => { throw err })
        })
    }
    static all(values) {
        // Promise.all返回一个promise，当所有的结果为成功时才成功
        return new Promise((resolve, reject) => {
            let resultArr = []  // 结果列表，里面是有序的
            let orderIndex = 0  // 计数
            // 处理结果的方法，使下标和结果相对应
            const processResultByKey = (value, index) => {
                resultArr[index] = value
                if (++orderIndex === values.length) {
                    // 当列表里所有元素都处理完，返回结果
                    resolve(resultArr)
                }
            }

            for (let i = 0; i < values.length; i++) {
                const element = values[i]
                // 判断当前对象是不是一个promise
                if (element && typeof element.then === 'function') {
                    // 当前元素是promise，则调用then方法取得结果
                    // 有一个失败了，promise.all返回的promise就失败
                    // 所以失败的回调用promise.all返回的的promise的reject
                    element.then((val) => {
                        processResultByKey(val, i)
                    }, reject)
                } else {
                    processResultByKey(value, i)
                }
            }
        })
    }
}

module.exports = Promise