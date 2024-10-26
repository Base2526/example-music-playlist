import jwt from 'jsonwebtoken';
import _ from "lodash";
import deepdash from "deepdash";
deepdash(_);
import mongoose from 'mongoose';
import cryptojs from "crypto-js";
import * as fs from "fs";
import * as path from 'path';

import AppError from "./AppError"

import * as Model from "../model"
import * as Constants from "../constants"
import * as cache from "../cache"

import logger from "./logger";

// import { generatePeriodsFromDates } from "./generatePeriods";

export const loggerError = async(req, message) =>{
   let { current_user } = await checkAuth(req);
   let user_agent = userAgent(req)
   logger.error( message, 
                    {
                      username: current_user,
                      ipAddress: "127.0.0.1",
                      userAgent: user_agent
                    }
                )
}

export const loggerInfo = async(req, message) =>{
    let { current_user } = await checkAuth(req);
    let user_agent = userAgent(req)
    logger.info( message, 
                    {
                        username: current_user,
                        ipAddress: "127.0.0.1",
                        userAgent: user_agent
                    }
                )
 }

export const emailValidate = () =>{
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
}

export const fileRenamer = (filename) => {
    const queHoraEs = Date.now();
    const regex = /[^a-zA-Z]/g ///[\s_-]/gi;
    const fileTemp = filename.replace(regex, ".");
    let arrTemp = [fileTemp.split(".")];
    return `${arrTemp[0].slice(0, arrTemp[0].length - 1).join("_")}${queHoraEs}.${arrTemp[0].pop()}`;
};

export const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export const getSession = async(userId, input) => {  
    await Model.Session.deleteOne({userId})
    let session = await Model.Session.create({  ...input, 
                                                userId, 
                                                token: jwt.sign(userId.toString(), process.env.JWT_SECRET)});
  
    return cryptojs.AES.encrypt(session?._id.toString(), process.env.JWT_SECRET).toString() 
}

export const checkAuth = async(req) => {
    // console.log("@1 checkAuth :", req)
    if (req && req["custom-authorization"]) {
        const auth    = req["custom-authorization"];
        const parts   = auth.split(" ");
        const bearer  = parts[0];
        try{
            const sessionId   = cryptojs.AES.decrypt(parts[1], process.env.JWT_SECRET).toString(cryptojs.enc.Utf8);
            if (bearer === "Bearer") {
                let session = await Model.Session.findOne({_id: sessionId});
                if(!_.isEmpty(session)){
                    var expiredDays = parseInt((session.expired - new Date())/ (1000 * 60 * 60 * 24));

                    // code
                    // -1 : force logout
                    //  0 : anonymums
                    //  1 : OK
                    if(expiredDays >= 0){
                        let userId  = jwt.verify(session.token, process.env.JWT_SECRET);
                        let current_user = await getMember({_id: userId}) 

                        if(!_.isNull(current_user)){
                            return {
                                status: true,
                                code: Constants.SUCCESS,
                                pathname: JSON.parse(req["custom-location"])?.pathname,
                                current_user,
                            }
                        }
                    }
                }
            }
            throw new AppError(Constants.FORCE_LOGOUT, 'Expired!', req)
        } catch (e) {
            throw new AppError(Constants.FORCE_LOGOUT, 'Expired!', {...e, ...req} )
        }
    }
    return {
        status: false,
        code: Constants.USER_NOT_FOUND,
        message: "without user - anonymous user"
    }
}

export const userAgent = (req) => {
    if (req.headers && req.headers["user-agent"]) {
        return req.headers["user-agent"];
    }
    return "no-user-agent";
}

export const checkAuthorizationWithSessionId = async(sessionId) => {
    // let decode = jwt.verify(token, process.env.JWT_SECRET);
    // console.log("sessionId > ", sessionId)
    var sId   = cryptojs.AES.decrypt(sessionId, process.env.JWT_SECRET).toString(cryptojs.enc.Utf8);
       
    let session = await Model.Session.findById(sId)   

    if(!_.isEmpty(session)){
        var expiredDays = parseInt((session.expired - new Date())/ (1000 * 60 * 60 * 24));

        // console.log("session expired :", session.expired, expiredDays, req)

        // code
        // -1 : force logout
        //  0 : anonymums
        //  1 : OK
        if(expiredDays >= 0){
            let userId  = jwt.verify(session.token, process.env.JWT_SECRET);


            // console.log("checkAuthorization : ", session.token, userId )
            // return {...req, currentUser: await Model.User.findById(userId)} 

            return {
                status: true,
                code: Constants.SUCCESS,
                current_user: await Model.User.findById(userId),
            }
        }

        await Model.Session.deleteOne( {"_id": sessionId} )

        // force logout
        return {
            status: false,
            code: Constants.FORCE_LOGOUT,
            message: "session expired days"
        }
    }

    // without user
    return {
        status: false,
        code: Constants.USER_NOT_FOUND,
        message: "without user"
    }
}

export const getBalance = async(userId) =>{    
    let aggregate = [
                        { 
                            $match: { userId: mongoose.Types.ObjectId(userId), 
                                        status: {$in: [Constants.WAIT, Constants.APPROVED]},
                                        // status: Constants.APPROVED,
                                        type: {$in: [Constants.SUPPLIER, Constants.DEPOSIT, Constants.WITHDRAW]}  } 
                        },
                        {
                            $lookup: {
                                localField: "refId",
                                from: "supplier",
                                foreignField: "_id",
                                pipeline: [{ $match: { buys: { $elemMatch : { userId: mongoose.Types.ObjectId(userId) }} }}],
                                as: "supplier"
                            }                 
                        },
                        {
                            $lookup: {
                                localField: "refId",
                                from: "deposit",
                                foreignField: "_id",
                                as: "deposit"
                            }
                        },
                        {
                            $lookup: {
                                localField: "refId",
                                from: "withdraw",
                                foreignField: "_id",
                                as: "withdraw"
                            }
                        },
                        {
                            $unwind: {
                                path: "$supplier",
                                preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $unwind: {
                                path: "$deposit",
                                preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $unwind: {
                                path: "$withdraw",
                                preserveNullAndEmptyArrays: true
                            }
                        }
                    ];

    let transitions = await Model.Transition.aggregate(aggregate);

    let money_use       = 0; // เงินที่เรากดซื้อหวย สำเร็จแล้ว
    let money_lock      = 0; // เงินที่เรากดจองหวย สำเร็จแล้ว
    let money_deposit   = 0; // เงินฝาก สำเร็จแล้ว
    let money_withdraw  = 0; // เงินถอน สำเร็จแล้ว
    let in_carts        = [];
    _.map(transitions, (transition) =>{
        switch(transition.type){
            case Constants.SUPPLIER:{
                let { supplier } = transition
                if(supplier !== undefined){
                    let { priceUnit, buys } = supplier
                    if(transition.status === Constants.WAIT){
                        let filter = _.filter( buys, (buy)=> _.isEqual(buy.transitionId, transition._id) )
                        money_lock += filter.length * priceUnit
                    }else if(transition.status === Constants.APPROVED){
                        let filter = _.filter( buys, (buy)=> _.isEqual(buy.transitionId, transition._id) )
                        money_use += filter.length * priceUnit
                    }
                    in_carts = [...in_carts, transition]
                }
                break
            } 
            case Constants.DEPOSIT:{
                let { status, deposit } = transition
                if(status === Constants.APPROVED){
                    let { balance } = deposit
                    money_deposit += balance;
                }
            break
            } 
            case Constants.WITHDRAW:{
                let { status, withdraw } = transition
                if(status === Constants.APPROVED){
                    let { balance } = withdraw
                    money_withdraw += balance;
                }
            break
            }
        }
    })  

    let money_balance = money_deposit - ( money_use + money_lock - money_withdraw )

    return { transitions, money_balance, money_use, money_lock, money_deposit, money_withdraw, in_carts }
}

/*
export const getBalance = async(userId) =>{    
    let supplier =  await Model.Transition.aggregate([
                        { 
                            $match: { userId, status: {$in: [Constants.WAIT, Constants.APPROVED]}, type: Constants.SUPPLIER  } 
                        },
                        {
                            $lookup: {
                                localField: "refId",
                                from: "supplier",
                                foreignField: "_id",
                                pipeline: [{ $match: { buys: { $elemMatch : { userId }} }}],
                                as: "supplier"
                            }                 
                        },
                        {
                            $unwind: {
                                path: "$supplier",
                                preserveNullAndEmptyArrays: false
                            }
                        }
                    ])

    let deposit =   await Model.Transition.aggregate([
                        { 
                            $match: { userId, status: Constants.APPROVED , type: Constants.DEPOSIT  } 
                        },
                        {
                            $lookup: {
                                localField: "refId",
                                from: "deposit",
                                foreignField: "_id",
                                as: "deposit"
                            }
                        },
                        {
                            $unwind: {
                                path: "$deposit",
                                preserveNullAndEmptyArrays: false
                            }
                        }
                    ])

    let withdraw = await Model.Transition.aggregate([
                        { 
                            $match: { userId, status: 14 , type: 12  } 
                        },
                        {
                            $lookup: {
                                localField: "refId",
                                from: "withdraw",
                                foreignField: "_id",
                                as: "withdraw"
                            }
                        },
                        {
                            $unwind: {
                                path: "$withdraw",
                                preserveNullAndEmptyArrays: false
                            }
                        }
                    ])
    
    let balance     = 0;
    _.map(supplier, (sup)=>{
        let buys = _.filter(sup.supplier.buys, (buy)=> _.isEqual(buy.userId, userId))
        balance -= buys.length * sup.supplier.price
    })

    _.map(deposit, (dep)=>{
        balance +=dep?.deposit?.balance
    })

    _.map(withdraw, (dep)=>{
        balance -=dep?.withdraw?.balance
    })

    return balance
}

export const getBalanceBook = async(userId) =>{    
    let supplier = await Model.Transition.aggregate([
                        { 
                            $match: { userId, status: {$in: [Constants.WAIT, Constants.APPROVED]} , type: Constants.SUPPLIER  } 
                        },
                        {
                            $lookup: {
                                localField: "refId",
                                from: "supplier",
                                foreignField: "_id",
                                pipeline: [{ $match: { buys: { $elemMatch : { userId }} }}],
                                as: "supplier"
                            }                 
                        },
                        {
                        $unwind: {
                            "path": "$supplier",
                            "preserveNullAndEmptyArrays": false
                        }
                        }
                    ])
    
    let balanceBook = 0;
    _.map(supplier, (sup)=>{
        let filters = _.filter(sup.supplier.buys, (buy)=> _.isEqual(buy.userId, userId) && buy.selected == 0 )
        balanceBook += filters.length * sup.supplier.price
    })
    
    return balanceBook
}

export const getInTheCarts = async(userId) =>{
    let supplier = await Model.Transition.aggregate([
                        { 
                            $match: { userId, status: {$in: [Constants.WAIT, Constants.APPROVED]} , type: Constants.SUPPLIER  } 
                        },
                        {
                            $lookup: {
                                localField: "refId",
                                from: "supplier",
                                foreignField: "_id",
                                pipeline: [{ $match: { buys: { $elemMatch : { userId }} }}],
                                as: "supplier"
                            }                 
                        },
                        {
                        $unwind: {
                            "path": "$supplier",
                            "preserveNullAndEmptyArrays": false
                        }
                        }
                    ])
    return supplier
}
*/

// export const checkBalanceBook = async(userId) =>{
//     try{
//         let suppliers = await Model.Supplier.find({buys: { $elemMatch : {userId}}})
//         let prices  =   _.filter( await Promise.all(_.map(suppliers, async(supplier)=>{
//                             let { price, buys } = supplier;
//                             let filters = _.filter(buys, (buy)=> _.isEqual(buy.userId, userId) && buy.selected == 0 )
//                             return price * filters.length
//                         })), (p)=>p!=0)
//         return _.reduce(prices, (ps, i) => ps + i, 0);
//     } catch(err) {
//         console.log("error :", err)
//         return 0;
//     }
// }

export const checkBalance = async(userId) =>{
    let supplier =  await Model.Transition.aggregate([
                        { 
                            $match: { userId, status: {$in: [Constants.WAIT, Constants.APPROVED]} , type: Constants.SUPPLIER  } 
                        },
                        {
                            $lookup: {
                                localField: "refId",
                                from: "supplier",
                                foreignField: "_id",
                                pipeline: [{ $match: { buys: { $elemMatch : { userId }} }}],
                                as: "supplier"
                            }                 
                        },
                        {
                        $unwind: {
                            "path": "$supplier",
                            "preserveNullAndEmptyArrays": false
                        }
                        }
                    ])

    let deposit =   await Model.Transition.aggregate([
                        { 
                            $match: { userId, status: Constants.APPROVED , type: Constants.DEPOSIT  } 
                        },
                        {
                            $lookup: {
                                localField: "refId",
                                from: "deposit",
                                foreignField: "_id",
                                as: "deposit"
                            }
                        },
                        {
                        $unwind: {
                                "path": "$deposit",
                                "preserveNullAndEmptyArrays": false
                            }
                        }
                    ])

    let withdraw = await Model.Transition.aggregate([
                        { 
                            $match: { userId, status: 14 , type: 12  } 
                        },
                        {
                            $lookup: {
                                localField: "refId",
                                from: "withdraw",
                                foreignField: "_id",
                                as: "withdraw"
                            }
                        },
                        {
                        $unwind: {
                            "path": "$withdraw",
                            "preserveNullAndEmptyArrays": false
                        }
                        }
                    ])

    let balance     = 0;
    let balanceBook = 0;
    _.map(supplier, (sup)=>{
        let buys = _.filter(sup.supplier.buys, (buy)=> _.isEqual(buy.userId, userId))
        balance -= buys.length * sup.supplier.priceUnit

        let filters = _.filter(sup.supplier.buys, (buy)=> _.isEqual(buy.userId, userId) && buy.selected === 0 )
        balanceBook += filters.length * sup.supplier.priceUnit
    })

    _.map(deposit, (dep)=>{
        balance +=dep?.deposit?.balance
    })

    _.map(withdraw, (dep)=>{
        balance -=dep?.withdraw?.balance
    })
} 

export const checkRole = (user) =>{
    // console.log("@1 checkRole :", user)
    if(user?.current?.roles){
        let { REACT_APP_USER_ROLES } = process.env
        // console.log("@2 checkRole :", user?.current?.roles, REACT_APP_USER_ROLES)
        if(_.includes( user?.current?.roles, parseInt(_.split(REACT_APP_USER_ROLES, ',' )[0])) ){
            return Constants.ADMINISTRATOR;
        }
        else if(_.includes( user?.current?.roles, parseInt(_.split(REACT_APP_USER_ROLES, ',' )[2])) ){
            return Constants.SELLER;
        }
        else if(_.includes( user?.current?.roles, parseInt(_.split(REACT_APP_USER_ROLES, ',' )[1])) ){
            return Constants.AUTHENTICATED;
        }
    }
    return Constants.ANONYMOUS;
}

export const getUser = async(query, without_password = true) =>{
    let fields = { username: 1, password: 1, email: 1, displayName: 1, banks: 1, roles: 1, avatar: 1, subscriber: 1, producer: 1, lastAccess: 1 }
    if(without_password){
        fields = { username: 1, email: 1, displayName: 1, banks: 1, roles: 1, avatar: 1, subscriber: 1, producer: 1, lastAccess: 1 }
    }

    // if(query?._id){
    //     let cache_user = cache.ca_get( query?._id.toString() )
    //     if(!_.isEmpty(cache_user)){
    //         return cache_user
    //     }else{
    //         let user =  await Model.User.findOne( query,  fields )
    //         cache.ca_save( query?._id.toString() , user._doc)
    //         return user
    //     }       
    // }

    return  await Model.User.findOne( query, fields )
}

export const getMember = async(query, without_password = true) =>{
    // let fields = { "current.username": 1, "current.password": 1, "current.email": 1, "current.displayName": 1, "current.roles": 1 }
    // if(without_password){
    //     fields = { "current.username": 1, "current.email": 1, "current.displayName": 1, "current.roles": 1 }
    // }
    return  await Model.Member.findOne( query  )
}

export const getUserFull = async(query) =>{
    let user =  await Model.User.findOne(query, { username: 1, email: 1, displayName: 1, banks: 1, roles: 1, avatar: 1, subscriber: 1, producer: 1, lastAccess: 1, lockAccount: 1 } )

    // if(user) {
    //     let cache_user = cache.ca_get(user?._doc?._id.toString())

    //     if(!_.isEmpty(cache_user)){
    //         return cache_user
    //     }else{
            // let { banks } = user
            // banks = _.filter(await Promise.all(_.map(banks, async(value)=>{
            //             let bank = await Model.Bank.findOne({_id: value.bankId})
            //             return _.isNull(bank) ? null : {...value._doc, name:bank?.name}
            //         })), e=>!_.isNull(e) ) 

            let { money_balance, money_lock, in_carts } = await getBalance(user?._id)
      
            let cache_user = {  ...user?._doc, 
                            // banks, 
                            balance: money_balance,//await getBalance(user?._id), 
                            balanceBook: money_lock, // await getBalanceBook(user?._id),
                            transitions: [], 
                            inTheCarts: in_carts, // await getInTheCarts(user?._id)
                        }
            // cache.ca_save(user?._doc?._id.toString(), cache_user)

            return cache_user
        // }        
    // }else{
    //     return null
    // }
}

export const getUsers = async(query) =>{
    return await Model.User.find(query, {   username: 1, 
                                            email: 1, 
                                            displayName: 1, 
                                            banks: 1, 
                                            roles: 1, 
                                            avatar: 1, 
                                            subscriber: 1, 
                                            producer: 1,
                                            lastAccess: 1 })
}

export const getSupplier = async(query) =>{
    let cache_supplier = cache.ca_get(query?._id)
    // if(!_.isEmpty(cache_supplier)){
    //     return cache_supplier;
    // }

    cache_supplier = await Model.Supplier.aggregate([
        { 
            $match: {_id: mongoose.Types.ObjectId(query?._id)} 
        },
        {
            $lookup: {
                localField: "ownerId",
                from: "user",
                foreignField: "_id",
                pipeline: [
                    { $project:{ username: 1, email: 1, displayName: 1, banks: 1, roles: 1, avatar: 1, subscriber: 1, lastAccess: 1 }}
                ],
                as: "owner"
            }
        },
        {
            $lookup: {
                localField: "manageLottery",
                from: "manageLottery",
                foreignField: "_id",
                // pipeline: [ { $project:{ date: 1 }} ],
                as: "manageLottery"
            }
        },
        {
            $unwind: {
                path: "$owner",
                preserveNullAndEmptyArrays: false
            }
        },
        {
            $unwind: {
                path: "$manageLottery",
                preserveNullAndEmptyArrays: false
            }
        }
    ])

    cache.ca_save(query?._id, cache_supplier[0])
    return cache_supplier[0];
}

export const getTotalSupplier = async() =>{
    // let key = "length"
    // let length = cache.ca_get(key)
    // if(!_.isEmpty(length)){
    //     return length;
    // }
    // length = (await Model.Supplier.find({})).length
    // cache.ca_save(key, length)
    let length = (await Model.Supplier.find({})).length
    return length
}

export const updateSupplier = async(filter, update, options = {}) =>{
    cache.ca_delete(filter?._id)
    return await Model.Supplier.updateOne( filter,  update, options );
}

export const updateSuppliers = async(filter, update, options = {}) =>{
    return await Model.Supplier.updateMany( filter,  update, options );
}

export const getLineNumber = () => {
    const error = new Error();
    const stackTrace = error.stack.split('\n')[2]; // Adjust the index based on your needs
  
    // Extract the line number using a regular expression
    const lineNumber = stackTrace.match(/:(\d+):\d+/)[1];
    
    return parseInt(lineNumber);
}

export const dumpError = (err) => {
    if (typeof err === 'object') {
      if (err.message) {
        console.log('\nMessage: ' + err.message)
      }
      if (err.stack) {
        console.log('\nStacktrace:')
        console.log('====================')
        console.log(err.stack);
      }
    } else {
      console.log('dumpError :: argument is not an object');
    }
}

export const divide = (a, b) => {
    if (b === 0) {
      throw new Error("Division by zero is not allowed.");
    }
    return a / b;
}

export const cloneLottery = async(id) => {
    try {
        // Find the user by ID
        //   const originalUser = await User.findById(userId);
        let originalSuppliers = await Model.Supplier.findById(id)
    
        // Clone the user using toObject
        const clonedSuppliersObject = originalSuppliers.toObject();
    
        // Make modifications to the cloned object (for example, change username)
        clonedSuppliersObject.buys = [];
        clonedSuppliersObject.follows = []
    
        // Create a new Mongoose document with the cloned object
        //   const clonedUser = new User(clonedUserObject);
        const clonedSuppliers = new Model.Supplier(clonedSuppliersObject);
        clonedSuppliers._id   = new mongoose.Types.ObjectId();
        clonedSuppliers.files = [];
        clonedSuppliers.publish = false;
        clonedSuppliers.expire = false;
        await clonedSuppliers.save()

        let newFiles = [];
        _.map(originalSuppliers?.files, async originalFile=>{
            const imageBuffer = await fs.promises.readFile(`/app/uploads${ _.replace(originalFile.url, "images", "") }`);// fs.readFileSync(originalFile.url);

            const assetUniqName = fileRenamer(originalFile.filename);
            const newImagePath =  `/app/uploads/${assetUniqName}`;// `path/to/new/image/${clonedUser._id}.jpg`;
            await fs.promises.writeFile(newImagePath, imageBuffer);

            newFiles.push({ url: `images/${assetUniqName}`, filename: originalFile.filename, encoding: originalFile.encoding, mimetype: originalFile.mimetype });
            
            if(originalSuppliers?.files.length === newFiles.length){
                clonedSuppliers.files = newFiles;
                await clonedSuppliers.save()
            }
        })

        return clonedSuppliers;
      /*
      // Read the image file content
      const imageBuffer = await fs.readFile(originalUser.profileImage);
  
      // Save the image file for the new user
      const newImagePath = `path/to/new/image/${clonedUser._id}.jpg`;
      await fs.writeFile(newImagePath, imageBuffer);
  
      // Update the profileImage path for the new user
      clonedUser.profileImage = newImagePath;
      await clonedUser.save();
      */
  
      console.log('User cloned and modified successfully.');
    } catch (error) {
      console.error('Error cloning and modifying user:', error);
    } finally {
        //   mongoose.disconnect();
    }
}

export const mlmCal = async(parentId, level) =>{
    let result = [];

    const process = async(parentId, level, parentUsername, parentParentId) => {
        const mlm = await Model.MLM.findOne({ "current.parentId": mongoose.Types.ObjectId(parentId) });
        const member = await getMember({ _id: mongoose.Types.ObjectId(parentId) });
        if (!mlm || !member){
            if(level === 1){
                result.push({ name: member?.current?.displayName, memberId: parentId, parentId: null, amount: 250, otherInfo: `${member?.current?.displayName}` });
            }else{
                result.push({ name: member?.current?.displayName, memberId: parentId, parentId: parentParentId, amount: 250, otherInfo: `${member?.current?.displayName}` });
            }
            
            return;
        } 

        const levelInfo = `(L${level}) ${member?.current?.displayName}`;
        const parentInfo = parentUsername ? `${parentUsername} ${levelInfo}` : levelInfo;
        // console.log(`Level #${level}: ${parentInfo}, ${mlm.childs}`);
        
        result.push({ name: member?.current?.displayName, memberId: parentId, parentId: parentParentId, amount: 250, otherInfo: levelInfo });

        if (mlm.current.childs && mlm.current.childs.length > 0 && level < 5) {
            await Promise.all(mlm.current.childs.map(value => process(value.childId, level + 1, parentInfo, parentId)));
        }
    }

    await process(parentId, 1, "", null);

    console.log("mlmCal :", result)

    const convertToTreeNode = (array) => {
        let tree = {};
        let children = {};
    
        // Create a map of children
        array.forEach(item => {
            if (item.parentId === null) {
                tree[item.memberId] = { ...item, children: [] };
            } else {
                if (!children[item.parentId]) {
                    children[item.parentId] = [];
                }
                children[item.parentId].push(item);
            }
        });
    
        // Recursive function to build tree
        const buildTree=(node) =>{
            if (children[node.memberId]) {
                node.children = children[node.memberId].map(child => {
                    let newNode = { ...child, children: [] };
                    buildTree(newNode);
                    return newNode;
                });
            }
        }
    
        // Build the tree starting from the root
        Object.values(tree).forEach(root => {
            buildTree(root);
        });
    
        return Object.values(tree);
    }
    
    return convertToTreeNode(result) //result
}

export const logUserAccess = async (mode, ctx) =>{
    const { connectionParams, extra } = ctx;
    switch(mode){
        case 0: {
            let request = {...extra.request.headers, ip: connectionParams?.ip, }
            if(connectionParams?.authToken){
                var sessionId   = cryptojs.AES.decrypt(connectionParams?.authToken, process.env.JWT_SECRET).toString(cryptojs.enc.Utf8);
                let session     = await Model.Session.findOne({_id: sessionId});
                // console.log("checkAuth #  session @1 : ", session)
                if(!_.isEmpty(session)){
                    var expiredDays = parseInt((session.expired - new Date())/ (1000 * 60 * 60 * 24));

                    // code
                    // -1 : force logout
                    //  0 : anonymums
                    //  1 : OK
                    if(expiredDays >= 0){
                        let userId  = jwt.verify(session.token, process.env.JWT_SECRET);
                        let current_user = await getMember({_id: userId}) 

                        let userAccess = await Model.LogUserAccess.findOne({"current.userId": current_user?._id })

                        if(_.isNull(userAccess)){
                            await Model.LogUserAccess.create({"current.websocketKey": extra?.request?.headers['sec-websocket-key'], "current.userId": current_user?._id, "current.request": request, "current.connectTime": Date.now()});
                        }else{
                            await Model.LogUserAccess.updateOne({"current.userId": current_user?._id }, {"current.websocketKey": extra?.request?.headers['sec-websocket-key'], "current.request": request, "current.connectTime": Date.now(), "current.disconnectTime": null, history: createRevision(userAccess) });
                        }
                    }
                }
            }

            break;
        }

        case 1: {
            if(connectionParams?.authToken){
                var sessionId   = cryptojs.AES.decrypt(connectionParams?.authToken, process.env.JWT_SECRET).toString(cryptojs.enc.Utf8);
                let session     = await Model.Session.findOne({_id: sessionId});
                // console.log("checkAuth #  session @1 : ", session)
                if(!_.isEmpty(session)){
                    var expiredDays = parseInt((session.expired - new Date())/ (1000 * 60 * 60 * 24));
        
                    // code
                    // -1 : force logout
                    //  0 : anonymums
                    //  1 : OK
                    if(expiredDays >= 0){
                        let userId  = jwt.verify(session.token, process.env.JWT_SECRET);
                        // let current_user = await Utils.getMember({_id: userId}) //await Model.User.findOne({_id: userId});
        
                        let userAccess = await Model.LogUserAccess.findOne({"current.websocketKey": extra?.request?.headers['sec-websocket-key'] })
        
                        if(!_.isNull(userAccess)){
                            await Model.LogUserAccess.updateOne({"current.websocketKey": extra?.request?.headers['sec-websocket-key'] }, { "current.disconnectTime": Date.now() });
                        }
                    }
                }
            }

            break;
        }
    }
}

export const createRevision = (model) =>{
    // Save the current version to history
    const current = model?.current;
    const version = model?.history.length + 1;

    return [...model?.history, { version: version, data: current, updatedAt: new Date() }];
}

export const saveFile = async(user, file) =>{
     // Start a transaction
     const session = await mongoose.startSession();
     session.startTransaction()
 
     try {
        const { createReadStream, filename, encoding, mimetype } = file?.file
        const stream = createReadStream();
        const assetUniqName = fileRenamer(filename);
        let pathName = `/app/uploads/${assetUniqName}`;

        const output = fs.createWriteStream(pathName)
        stream.pipe(output);

        const resultFile = await new Promise(function (resolve, reject) {
            output.on('finish', async () => {
                try {
                    let file = await Model.File.create({userId: user?._id,  url: `images/${assetUniqName}`, filename, encoding, mimetype });
                    resolve(file);
                } catch (error) {
                    reject(`Failed to save data to MongoDB: ${error.message}`);
                }
            });
        
            output.on('error', async(err) => {
                // await loggerError(req, err.toString());
                console.log("error")

                reject(err);
            });
        });

        // Commit the transaction
        await session.commitTransaction(); // Replace with your transaction commit logic

        return resultFile;
     }catch(error){
         await session.abortTransaction();
         console.log(`saveFiles Error : ${error}`)
     }finally {
         session.endSession();
     }     
 
     return ;
}

export const saveFiles = async(user, files) =>{
    // Start a transaction
    const session = await mongoose.startSession();
    session.startTransaction()

    try {
        const promises = []; // Array to hold all promises
        for (let i = 0; i < files.length; i++) {
            const { createReadStream, filename, encoding, mimetype } = (await files[i]).file

            const stream = createReadStream();
            const assetUniqName = fileRenamer(filename);
            let pathName = `/app/uploads/${assetUniqName}`;

            const output = fs.createWriteStream(pathName)
            stream.pipe(output);

            const promise = await new Promise(function (resolve, reject) {
                output.on('finish', async () => {
                    try {
                        let file = await Model.File.create({userId: user?._id,  url: `images/${assetUniqName}`, filename, encoding, mimetype });
                        resolve(file);
                    } catch (error) {
                        reject(`Failed to save data to MongoDB: ${error.message}`);
                    }
                });
            
                output.on('error', async(err) => {
                    // await loggerError(req, err.toString());
                    console.log("error")

                    reject(err);
                });
            });

            promises.push(promise); // Add the promise to the array
        }

        // Wait for all promises to resolve
        let resultFiles =  await Promise.all(promises);

        // Commit the transaction
        await session.commitTransaction(); // Replace with your transaction commit logic

        return resultFiles;
    }catch(error){
        await session.abortTransaction();
        console.log(`saveFiles Error : ${error}`)
    }finally {
        session.endSession();
    }     

    return [];
}

export const addMLM = async( ownerId, input ) =>{
    let { parentId, packages }  = input;
    if( parentId === "" ||  packages === "" ){
        console.log("@1 addMLM :", parentId, packages)
        return {
            status: false
        }
    }

    console.log("@2 addMLM :", packages)
    switch(packages){
        case 1: {
                // ดึง ownerId === parentId & level=0 & number=0
                let mlm = await Model.MLM.findOne({ "current.ownerId": mongoose.Types.ObjectId(parentId), 
                                                    "current.level": 0,
                                                    "current.number": 0 })
                if(!_.isEmpty(mlm)){
                    console.log("@@1 :", mlm)

                    // LEVEL #1
                    let mlm1 = await Model.MLM.find({ "current.parentId": mongoose.Types.ObjectId(parentId), "current.level": 1})

                    if(_.isEmpty(mlm1)){
                        console.log("@@2 :", mlm1)
                        let newInput ={current: { ownerId, parentId, level: 1, number: 0 }}  
                        await Model.MLM.create(newInput);

                        return { status: true, message: "@@2" }     
                    }else if(mlm1.length <= 6){
                        console.log("@@3 :", mlm1)
                        let newInput ={current: { ownerId, parentId, level: 1, number: mlm1.length }}  
                        await Model.MLM.create(newInput);

                        return { status: true, message: "@@3" }     
                    }else{
                        _.map(mlm1, async(value1)=>{
                            console.log("mlm1 ::", value1)

                            // LEVEL #2
                            let mlm2 = await Model.MLM.find({ "current.parentId": mongoose.Types.ObjectId(value1.current.ownerId), "current.level": 2})

                            if(_.isEmpty(mlm2)){
                                console.log("@@4 :", mlm2)
                                let newInput ={current: { ownerId, parentId: value1.current.ownerId, level: 2, number: 0 }}  
                                await Model.MLM.create(newInput);
        
                                return { status: true, message: "@@4" }     
                            }else if(mlm2.length <= 6){
                                console.log("@@3 :", mlm2)
                                let newInput ={current: { ownerId, parentId: value1.current.ownerId, level: 2, number: mlm1.length }}  
                                await Model.MLM.create(newInput);
        
                                return { status: true, message: "@@5" }     
                            }else{
                                _.map(mlm2, async(value2)=>{
                                    console.log("mlm2 ::", value2)

                                    // LEVEL #3
                                    let mlm3 = await Model.MLM.find({ "current.parentId": mongoose.Types.ObjectId(value2.current.ownerId), "current.level": 3})

                                    if(_.isEmpty(mlm3)){
                                        console.log("@@4 :", mlm3)
                                        let newInput ={current: { ownerId, parentId: value2.current.ownerId, level: 3, number: 0 }}  
                                        await Model.MLM.create(newInput);
                
                                        return { status: true, message: "@@4" }     
                                    }else if(mlm3.length <= 6){
                                        console.log("@@3 :", mlm3)
                                        let newInput ={current: { ownerId, parentId: value2.current.ownerId, level: 3, number: mlm1.length }}  
                                        await Model.MLM.create(newInput);
                
                                        return { status: true, message: "@@5" }     
                                    }else{
                                        _.map(mlm3, async(value3)=>{
                                            console.log("mlm3 ::", value3)

                                            // LEVEL #4
                                            let mlm4 = await Model.MLM.find({ "current.parentId": mongoose.Types.ObjectId(value3.current.ownerId), "current.level": 4})
                                            if(_.isEmpty(mlm4)){
                                                console.log("@@4 :", mlm4)
                                                let newInput ={current: { ownerId, parentId: value3.current.ownerId, level: 4, number: 0 }}  
                                                await Model.MLM.create(newInput);
                        
                                                return { status: true, message: "@@4" }     
                                            }else if(mlm4.length <= 6){
                                                console.log("@@3 :", mlm4)
                                                let newInput ={current: { ownerId, parentId: value3.current.ownerId, level: 4, number: mlm1.length }}  
                                                await Model.MLM.create(newInput);
                        
                                                return { status: true, message: "@@5" }     
                                            }else{
                                                _.map(mlm4, async(value4)=>{
                                                    console.log("mlm4 ::", value4)
                                                    // LEVEL #5
                                                    let mlm5 = await Model.MLM.find({ "current.parentId": mongoose.Types.ObjectId(value4.current.ownerId), "current.level": 5})
                                                    if(_.isEmpty(mlm5)){
                                                        console.log("@@4 :", mlm5)
                                                        let newInput ={current: { ownerId, parentId: value4.current.ownerId, level: 5, number: 0 }}  
                                                        await Model.MLM.create(newInput);
                                
                                                        return { status: true, message: "@@4" }     
                                                    }else if(mlm5.length <= 6){
                                                        console.log("@@3 :", mlm5)
                                                        let newInput ={current: { ownerId, parentId: value4.current.ownerId, level: 5, number: mlm1.length }}  
                                                        await Model.MLM.create(newInput);
                                
                                                        return { status: true, message: "@@5" }     
                                                    }else{
                                                        // LEVEL #6
                                                    }
                                                })
                                            }
                                        })
                                    }
                                })
                            }
                        })

                        return { status: true, message: "@@4" }
                    }
                    
                    // let childs = mlm?.current?.childs
                    // console.log("childs :", childs)
                    // let child = _.find(childs, e =>e.childId.equals(mongoose.Types.ObjectId(childId)))
                    // if(_.isEmpty(child)){
                    //     childs = [...childs, { childId }]
                    //     await Model.MLM.updateOne({ _id: mlm?._id }, { "current.childs": childs, history: Utils.createRevision(mlm) });
                    //     return {
                    //         status: true,
                    //         message: "UPDATE CHILD",
                    //     }
                    // }
                    // return {
                    //     status: false,
                    //     message: "EXITING CHILD",
                    // }

                    // let newInput ={current: { ownerId, parentId, level: 0, number: 0 }}  
                    // await Model.MLM.create(newInput);
                    
                    throw new AppError(Constants.ERROR, "Parent id is Empty @@@1 ")
                               
                }else{
                    throw new AppError(Constants.ERROR, "Parent id is Empty @@@2")
                }
            break;
        }

        case 7: {
            break;
        }

        case 49: {
            break;
        }

        case 343: {
            break;
        }

        case 2401: {
            break;
        }

        default:
            break;
    }

    // // Check ดูว่าเคยมี parentId หรือไม่
    // let mlm = await Model.MLM.find({"current.parentId": mongoose.Types.ObjectId(parentId) })
    // if(!_.isNull(mlm)){
    //     let childs = mlm?.current?.childs

    //     // console.log("childs :", childs)
    //     // let child = _.find(childs, e =>e.childId.equals(mongoose.Types.ObjectId(childId)))
    //     // if(_.isEmpty(child)){

    //     //     childs = [...childs, { childId }]
    //     //     await Model.MLM.updateOne({ _id: mlm?._id }, { "current.childs": childs, history: Utils.createRevision(mlm) });
    //     //     return {
    //     //         status: true,
    //     //         message: "UPDATE CHILD",
    //     //     }
    //     // }
    //     // return {
    //     //     status: false,
    //     //     message: "EXITING CHILD",
    //     // }
    // }else{
    //     // ถ้าไม่มี parentId แสดงว่า parentId นี้เป็น parent แล้วก้ addd child id ลงไป
    //     let newInput ={current: { parentId, childs: [{ childId }]}}  
    //     await Model.MLM.create(newInput);

    //     return {
    //         status: true,
    //         message: "PARENT NEW",
    //     }
    // }    
}

export const  insertNodes = async(ownerId, parentId, numChildren)=> {
    const createChildNode = async (ownerId, parentId, level, number) => {
      const newNode = { ownerId, parentNodeId: parentId, level, number };
      const createdNode = await Model.Node.create(newNode);
      return createdNode;
    };
  
    let currentParentId = parentId;
    let currentLevel = 1;
    let currentNumber = 0;
  
    for (let i = 0; i < numChildren; i++) {
      // Find children of the current node at the current level
      const siblings = await Model.Node.find({
        parentNodeId: currentParentId,
        level: currentLevel,
      });
  
      if (siblings.length < 7) {
        // If there is space, add the new child here
        currentNumber = siblings.length;
        await createChildNode(ownerId, currentParentId, currentLevel, currentNumber);
      } else {
        // Find a child node to insert into at the next level
        const childNodes = await Model.Node.find({
          parentNodeId: currentParentId,
          level: currentLevel + 1,
        });
  
        if (childNodes.length < 7) {
          // Ensure childNodes[0] exists before accessing _id
          if (childNodes[0]) {
            currentParentId = childNodes[0]._id;
            currentLevel++;
            currentNumber = 0;
            await createChildNode(ownerId, currentParentId, currentLevel, currentNumber);
          } else {
            // No children found at the next level; handle this case
            console.error('No available child node at the next level to insert into.');
            break;
          }
        } else {
          // Move to the next sibling if current sibling is full
          let inserted = false;
          for (let sibling of siblings) {
            const siblingChildren = await Model.Node.find({
              parentNodeId: sibling._id,
              level: currentLevel + 1,
            });
  
            if (siblingChildren.length < 7) {
              currentParentId = sibling._id;
              currentLevel++;
              currentNumber = siblingChildren.length;
              await createChildNode(ownerId, currentParentId, currentLevel, currentNumber);
              inserted = true;
              break;
            }
          }
          if (!inserted) {
            // Handle the case where all siblings are full
            console.error('All sibling nodes are full; no space to insert the new child.');
            break;
          }
        }

      }
    }
  }

async function addChild2(ownerId, parentId, level) {
    // Find current nodes at the same level under the same parent
    /*
     จะได้ current nodes ทั้งหมดใน level นี้
    */
    let currentChildren = await Model.Node.find({
        parentNodeId: mongoose.Types.ObjectId(parentId),
        level: level
    });

    if (currentChildren.length < 7) {
        // There's space in the current level, add the new child
        let newChild = {
            ownerId: ownerId,
            parentNodeId: parentId,
            level: level,
            number: currentChildren.length
        };
        await Model.Node.create(newChild);
    } else {
        // All current nodes are full, recurse to the next level
        /*
         เป็นการคำนวณหาจำนวน nodes level ถัดไป
        */
        let nextLevelChildren = await Model.Node.find({
            parentNodeId: { $in: currentChildren.map(child => child._id) },
            level: level + 1
        });

        console.log("nextLevelChildren :", nextLevelChildren, currentChildren.map(child => child._id) )


        for (let child of currentChildren) {
            let childNodes = await Model.Node.find({
                parentNodeId: child._id,
                level: level + 1
            });
            if (childNodes.length < 7) {
                await addChild(ownerId, child._id, level + 1);
                return;
            }
        }

        /*
            จำนวน node level ถัดไปต้องน้อยกว่า จำนวน node previous * 7
        */
        // if (nextLevelChildren.length < currentChildren.length * 7) {
        //     for (let child of currentChildren) {
        //         let childNodes = await Model.Node.find({
        //             parentNodeId: child._id,
        //             level: level + 1
        //         });
        //         if (childNodes.length < 7) {
        //             await addChild(ownerId, child._id, level + 1);
        //             return;
        //         }
        //     }
        // } else {
        //     throw new Error("Unable to add child. All nodes are full.");
        // }
    }
}

async function findParent_org(ownerId, parentId) {
    // level #1
    let currentChildren = await Model.Node.find({current: { parentNodeId: mongoose.Types.ObjectId(parentId) }});

    if (currentChildren.length < 7) {
        // add new childen 7 node
        // There's space in the current level, add the new child
        // let newChild = {
        //     ownerId: ownerId,
        //     parentNodeId: parentId,
        //     level: level,
        //     number: currentChildren.length + 1 // incremented by 1 for the new child
            
        // };
        // return await Model.Node.create(newChild);

        return { parentId, number: currentChildren.length + 1 }
    } else {
        
        // level #2
        let nextLevel2Children = await Model.Node.find({ current: { parentNodeId: { $in: currentChildren.map(child => child._id) }}});
        if (nextLevel2Children.length < currentChildren.length * 7) {
             // add new childen 49 node

            // If the current level is full, check for space in the next level
            for (let child of currentChildren) {
                let childNodes = await Model.Node.find({current: { parentNodeId: child._id }});

                if (childNodes.length < 7) {
                    return await findParent(ownerId, child._id /*, level + 1*/ );                    
                }
            }
        }else{

            // level #3
            let nextLevel3Children = await Model.Node.find({ current :{ parentNodeId: { $in: nextLevel2Children.map(child => child._id) } }});
            if (nextLevel3Children.length < nextLevel2Children.length * 7) {
                // add new childen 343 node

                // If the current level is full, check for space in the next level
                for (let child of nextLevel2Children) {
                    let childNodes = await Model.Node.find({current: { parentNodeId: child._id }} );

                    if (childNodes.length < 7) {
                        return await findParent(ownerId, child._id /*, level + 2*/ );                    
                    }
                }
            } else {

                // level #4
                let nextLevel4Children = await Model.Node.find({current: { parentNodeId: { $in: nextLevel3Children.map(child => child._id) } }});
                if (nextLevel4Children.length < nextLevel3Children.length * 7) {
                    // add new childen 2401 node
    
                    // If the current level is full, check for space in the next level
                    for (let child of nextLevel3Children) {
                        let childNodes = await Model.Node.find({current: { parentNodeId: child._id }});
    
                        if (childNodes.length < 7) {
                            return await findParent(ownerId, child._id /*, level + 3*/ );                    
                        }
                    }
                }else{
                    
                    // level #5
                    let nextLevel5Children = await Model.Node.find({ current: { parentNodeId: { $in: nextLevel4Children.map(child => child._id) } }});
                    if (nextLevel5Children.length < nextLevel4Children.length * 7) {
                        // add new childen 16807 node
        
                        // If the current level is full, check for space in the next level
                        for (let child of nextLevel4Children) {
                            let childNodes = await Model.Node.find({current :{ parentNodeId: child._id }} );
                            if (childNodes.length < 7) {
                                return await findParent( ownerId, child._id );                    
                            }
                        }
                    }else{
                        throw new Error("No space available to add a new child @2.");
                    }
                }
            }         
        }
    }
}

async function addChild_org(ownerId, parentId, level, session) {
    // Define constants
    const MAX_CHILDREN = 7;
    const MAX_LEVEL = 5;

    // Helper function to find children nodes with session
    const findChildren = async (parentNodeId) => {
        // Convert parentNodeId to ObjectId if it's a string
        const objectId = typeof parentNodeId === 'string' ? mongoose.Types.ObjectId(parentNodeId) : parentNodeId;
        return Model.Node.find({ parentNodeId: objectId }).session(session);
    };

    // Convert parentId to ObjectId if it's a string
    const parentIdObjectId = typeof parentId === 'string' ? mongoose.Types.ObjectId(parentId) : parentId;

    // Find current children of the parent node
    const currentChildren = await findChildren(parentIdObjectId);

    if (currentChildren.length < MAX_CHILDREN) {
        // Add new child if space is available
        const newChild = {
            ownerId,
            parentNodeId: parentIdObjectId,
            level,
            number: currentChildren.length + 1,
        };
        return await Model.Node.create([newChild], { session });
    }

    // Initialize variables for traversing levels
    let childrenToCheck = currentChildren;
    let nextLevel = level + 1;

    // Traverse through levels to find a space
    while (nextLevel <= MAX_LEVEL) {
        const parentIds = childrenToCheck.map(child => child._id);
        const nextLevelChildren = await findChildren({ $in: parentIds });

        if (nextLevelChildren.length < childrenToCheck.length * MAX_CHILDREN) {
            for (const child of childrenToCheck) {
                const childNodes = await findChildren(child._id);
                if (childNodes.length < MAX_CHILDREN) {
                    await addChild(ownerId, child._id, nextLevel, session);
                    return;
                }
            }
        }

        // Move to the next level
        childrenToCheck = nextLevelChildren;
        nextLevel++;
    }

    // Throw an error if no space is available
    throw new Error("No space available to add a new child.");
}

/*
parentId : first id node
*/
export async function findParent(parentId = null) {
    // let currentLevel = 1;
    let nodes = [parentId];
    let nextLevelNodes = [];
  
    while ( true/*currentLevel <= 10 */) {
      const children = await Model.Node.find({ 'current.parentNodeId': { $in: nodes } });
      
    //   console.log("#1 children :", children, nodes)
      if (children.length < nodes.length * 7) {
        // There's space in the current level, return a node where a new child can be added
        for (const nodeId of nodes) {
          const childCount = await Model.Node.countDocuments({ 'current.parentNodeId': nodeId  });
          if (childCount < 7) {
            return { parentId: nodeId, number: childCount + 1 };
          }
        }
      }
      
      // Prepare for the next level
      nextLevelNodes = children.map(child => child._id);
      nodes = nextLevelNodes;
    //   currentLevel++;
    }
}

/*
parentId : first id node
*/
export async function findChildren(parentId = null, level = 5) {
    let nodeParent = await Model.Node.findById(parentId);
    if (_.isEmpty(nodeParent)) {
        throw new Error("Parent node is empty.");
    }

    let currentLevel = 1;
    let nodes = [parentId];
    let objectNodes = [nodeParent];

    while (currentLevel <= level) {
        const children = await Model.Node.find({ 'current.parentNodeId': { $in: nodes } });
        // console.log("@1 ", children, nodes)
        if (children.length === 0) break; // Exit loop if no more children are found

        objectNodes = [...objectNodes, ...children];
        nodes = children.map(child => child._id);

        currentLevel++;
    }

    // console.log("Find Children Result:", objectNodes, "Total Nodes:", objectNodes.length);
    return objectNodes;
}
  
/*
สร้าง  init node ของแต่ละ user ตาม package 1, 8, 57
*/
export async function createChildNodes(_id, currentUser, packages, session) {
    let start = Date.now()

    // หา node แรกที่ _id เป็นเจ้าของ
    let rootNode = await Model.Node.findOne({'current.ownerId': _id, 'current.isParent': true });
    if(_.isEmpty(rootNode)){
        throw new Error("Root node is Empty _id :  " + _id);
    }

    // หา node ที่สามารถเพิ่มลงไปได้
    let {parentId, number} = await findParent(rootNode._id)

    if(_.isEmpty(parentId)){
        throw new Error("FindParent is Empty.");
    }

    // Generate a new ObjectId
    const documents = [];
    switch(packages){
        // package 1
        case 1: {
            // Create root node
            const _id0_0 = mongoose.Types.ObjectId();
            documents.push({ _id: _id0_0, current: { suggester: rootNode._id,  ownerId: currentUser._id, parentNodeId: parentId, number, isParent: true } });
            break;
        }

        // package 2
        case 2: {
            // Create root node
            const _id0_0 = mongoose.Types.ObjectId();
            documents.push({ _id: _id0_0, current: { suggester: rootNode._id, ownerId: currentUser._id, parentNodeId: parentId, number, isParent: true } });

            // Create level 1 nodes
            const level1Ids = [];
            for (let i = 0; i < 7; i++) {
                const id = mongoose.Types.ObjectId();
                documents.push({ _id: id, current: { ownerId: currentUser._id, parentNodeId: _id0_0, number: i + 1 } });
                level1Ids.push(id);
            }
            break;
        }

        // package 3
        case 3: {
            // Create root node
            const _id0_0 = mongoose.Types.ObjectId();
            documents.push({ _id: _id0_0, current: { ownerId: currentUser._id, parentNodeId: parentId, number, isParent: true } });

            // Create level 1 nodes
            const level1Ids = [];
            for (let i = 0; i < 7; i++) {
                const id = mongoose.Types.ObjectId();
                documents.push({ _id: id, current: { ownerId: currentUser._id, parentNodeId: _id0_0, number: i + 1 } });
                level1Ids.push(id);
            }

            // Create level 2 nodes
            const level2Ids = [];
            for (const parentId of level1Ids) {
                for (let i = 0; i < 7; i++) {
                    const id = mongoose.Types.ObjectId();
                    documents.push({ _id: id, current: { ownerId: currentUser._id, parentNodeId: parentId, number: i + 1 } });
                    level2Ids.push(id);
                }
            }
            break;
        }

        /*
        case 4: {
            // Create root node
            const _id0_0 = mongoose.Types.ObjectId();
            documents.push({ _id: _id0_0, current: { ownerId: currentUser._id, parentNodeId: parentId, number, isParent: true } });

            // Create level 1 nodes
            const level1Ids = [];
            for (let i = 0; i < 7; i++) {
                const id = mongoose.Types.ObjectId();
                documents.push({ _id: id, current: { ownerId: currentUser._id, parentNodeId: _id0_0, number: i + 1 } });
                level1Ids.push(id);
            }

            // Create level 2 nodes
            const level2Ids = [];
            for (const parentId of level1Ids) {
                for (let i = 0; i < 7; i++) {
                    const id = mongoose.Types.ObjectId();
                    documents.push({ _id: id, current: { ownerId: currentUser._id, parentNodeId: parentId, number: i + 1 } });
                    level2Ids.push(id);
                }
            }

            // Create level 3 nodes
            const level3Ids = [];
            for (const parentId of level2Ids) {
                for (let i = 0; i < 7; i++) {
                    const id = mongoose.Types.ObjectId();
                    documents.push({ _id: id, current: { ownerId: currentUser._id, parentNodeId: parentId, number: i + 1 } });
                    level3Ids.push(id);
                }
            }
            break;
        }

        case 5: {
            // Create root node
            const _id0_0 = mongoose.Types.ObjectId();
            documents.push({ _id: _id0_0, current: { ownerId: currentUser._id, parentNodeId: parentId, number, isParent: true } });

            // Create level 1 nodes
            const level1Ids = [];
            for (let i = 0; i < 7; i++) {
                const id = mongoose.Types.ObjectId();
                documents.push({ _id: id, current: { ownerId: currentUser._id, parentNodeId: _id0_0, number: i + 1 } });
                level1Ids.push(id);
            }

            // Create level 2 nodes
            const level2Ids = [];
            for (const parentId of level1Ids) {
                for (let i = 0; i < 7; i++) {
                    const id = mongoose.Types.ObjectId();
                    documents.push({ _id: id, current: { ownerId: currentUser._id, parentNodeId: parentId, number: i + 1 } });
                    level2Ids.push(id);
                }
            }

            // Create level 3 nodes
            const level3Ids = [];
            for (const parentId of level2Ids) {
                for (let i = 0; i < 7; i++) {
                    const id = mongoose.Types.ObjectId();
                    documents.push({ _id: id, current: { ownerId: currentUser._id, parentNodeId: parentId, number: i + 1 } });
                    level3Ids.push(id);
                }
            }

            // Create level 4 nodes
            const level4Ids = [];
            for (const parentId of level3Ids) {
                for (let i = 0; i < 7; i++) {
                    const id = mongoose.Types.ObjectId();
                    documents.push({ _id: id, current: { ownerId: currentUser._id, parentNodeId: parentId, number: i + 1 } });
                    level4Ids.push(id);
                }
            }
            break;
        }

        case 6: {
            // Create root node
            const _id0_0 = mongoose.Types.ObjectId();
            documents.push({ _id: _id0_0, current: { ownerId: currentUser._id, parentNodeId: parentId, number, isParent: true } });

            // Create level 1 nodes
            const level1Ids = [];
            for (let i = 0; i < 7; i++) {
                const id = mongoose.Types.ObjectId();
                documents.push({ _id: id, current: { ownerId: currentUser._id, parentNodeId: _id0_0, number: i + 1 } });
                level1Ids.push(id);
            }

            // Create level 2 nodes
            const level2Ids = [];
            for (const parentId of level1Ids) {
                for (let i = 0; i < 7; i++) {
                    const id = mongoose.Types.ObjectId();
                    documents.push({ _id: id, current: { ownerId: currentUser._id, parentNodeId: parentId, number: i + 1 } });
                    level2Ids.push(id);
                }
            }

            // Create level 3 nodes
            const level3Ids = [];
            for (const parentId of level2Ids) {
                for (let i = 0; i < 7; i++) {
                    const id = mongoose.Types.ObjectId();
                    documents.push({ _id: id, current: { ownerId: currentUser._id, parentNodeId: parentId, number: i + 1 } });
                    level3Ids.push(id);
                }
            }

            // Create level 4 nodes
            const level4Ids = [];
            for (const parentId of level3Ids) {
                for (let i = 0; i < 7; i++) {
                    const id = mongoose.Types.ObjectId();
                    documents.push({ _id: id, current: { ownerId: currentUser._id, parentNodeId: parentId, number: i + 1 } });
                    level4Ids.push(id);
                }
            }

            // Create level 5 nodes
            for (const parentId of level4Ids) {
                for (let i = 0; i < 7; i++) {
                    const id = mongoose.Types.ObjectId();
                    documents.push({ _id: id, current: { ownerId: currentUser._id, parentNodeId: parentId, number: i + 1 } });
                }
            }

            break;
        }
        */

        default:{
            throw new Error("Other packages");
        }
    }
    const result = await Model.Node.insertMany(documents, {session});

    let executionTime = `Time to execute = ${ (Date.now() - start) / 1000 } seconds`
    console.log("createChildNodes : result ", result.length, executionTime)
}

// Function to calculate the current node's level
const calculateNodeLevel = async (nodeId) => {
    let level = 0;
    let currentNode = await Model.Node.findById(nodeId);
    
    console.log(`Starting level calculation for nodeId: ${nodeId}`);

    while (currentNode && currentNode.current.parentNodeId) {
        level++;
        console.log(`Level: ${level}, Current Node: ${currentNode._id}, Parent Node ID: ${currentNode.current.parentNodeId}`);
        currentNode = await Model.Node.findById(currentNode.current.parentNodeId);
    }
    
    console.log(`Final level for nodeId: ${nodeId} is ${level}`);
    return level;
};

// Function to build the tree with level limitation
export async function buildTree(parentId = null, level = 1, limit=true) {
    console.log(`Building tree for parentId: ${parentId}, level: ${level}`);
    
    const nodes = await Model.Node.find({ 'current.parentNodeId': parentId });
    
    console.log(`Found ${nodes.length} nodes for parentId: ${parentId}`);

    return await Promise.all(nodes.map(async (node) => {
        // const level = await calculateNodeLevel(node._id);
        const nextLevel = level + 1;
        console.log(`Processing node: ${node._id} at level: ${nextLevel}`);

        // Check if current level exceeds maxLevel
        if (limit && nextLevel >= 5) {
            console.log(`Max level reached for node: ${node._id}. Not building children.`);
            return {
                title: `parentNodeId: ${node.current.parentNodeId}, ownerId: ${node.current.ownerId}, number: ${node.current.number}, level: ${level}, isParent: ${node.current.isParent}`,
                key: node._id.toString(),
                node,
                owner: await Model.Member.findById(node.current.ownerId),
                level: nextLevel,
                children: null, // No children if max level is reached
            };
        } else {
            // Continue building the tree recursively if max level is not reached
            console.log(`Building children for node: ${node._id}`);
            const children = await buildTree(node._id, nextLevel, limit);
            return {
                title: `parentNodeId: ${node.current.parentNodeId}, ownerId: ${node.current.ownerId}, number: ${node.current.number}, level: ${nextLevel}, isParent: ${node.current.isParent}`,
                key: node._id.toString(),
                node,
                owner: await Model.Member.findById(node.current.ownerId),
                level: nextLevel,
                children: children.length ? children : null,
            };
        }
    }));
}

/*
  ดึงข้อมูลนําไปสร้างเป้น tree 
  @param
   - nodeId 
*/
export const fetchTreeData = async(nodeId, limit = true) => {
    const level = 1;
    console.log(`Fetching data for nodeId: ${nodeId}`);

    const node = await Model.Node.findById(nodeId);
    console.log(`Node fetched:`, node);

    if (node) {
        const trees = await buildTree(nodeId, level, limit);
        /*
        const owner = await Model.Member.findById(node.current.ownerId);
        // console.log(`Owner fetched:`, owner);

        const result = [{
            title: `parentNodeId: ${node.current.parentNodeId}, ownerId: ${node.current.ownerId}, number: ${node.current.number}, level: ${ level }, isParent: ${node.current.isParent}`,
            key: node._id.toString(),
            node,
            owner,
            level,
            children: trees
        }];

        // console.log(`Resulting tree structure:`, JSON.stringify(result, null, 2));


        // Function to recursively extract key structure 
        // Get only field key to display
        const getKeyStructure = (nodes) => {
            return nodes.map(node => {
                const result = { key: node.key };
                if (node.children) {
                    result.children = getKeyStructure(node.children);
                }
                return result;
            });
        };

        // console.log(`Resulting tree structure:`, JSON.stringify(getKeyStructure(result), null, 2));
        */

        return trees;
    }

    console.log(`No node found for nodeId: ${nodeId}`);
    return [];
}

export const ___calculateTree = async () => {
    const session = await mongoose.startSession();
    session.startTransaction();

    // Create a timestamp for the file name
    const now       = new Date();
    const timestamp = now.toISOString().replace(/[-T:\.Z]/g, '');
    const dirPath   = "/app/uploads/nodemon_ignored";

    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

    // Output file path
    const outputFile = `${dirPath}/node_${timestamp}.json`;

    try {
        let users_without_admin = await Model.Member.find({ 'current.roles': { $nin: [Constants.ADMINISTRATOR.toString()] } });
        for (let user of users_without_admin) {
            // Find the root node for the user
            let rootNode = await Model.Node.findOne({ 'current.ownerId': user._id, 'current.isParent': true });

            if (_.isEmpty(rootNode)) {
                throw new Error("Root node is Empty.");
            }

            let children = await findChildren(rootNode._id);
            console.log("children:", rootNode._id, children.length);
        }

        // Fetch all documents from the collection
        const data = await Model.Node.find({});
        const jsonData = JSON.stringify(data, null, 2);

        // Write data to a file in JSON format
        fs.writeFile(outputFile, jsonData, 'utf8', async(err) => {
            let status = 0;
            if (err) {
                console.log("err:", err);
            } else {
                console.log("File has been saved.");
                status = 1;
            }
            let newTree = {
                userId: mongoose.Types.ObjectId(process.env.ID_USER_ADMIN),
                path: outputFile,
                fileName: path.basename(outputFile),
                status
            };
            await Model.CalTree.create([newTree], { session });

            // Commit the transaction
            await session.commitTransaction();
            session.endSession();
        });
    } catch (err) {
        try {
            fs.unlink(outputFile);
        } catch (unlinkErr) {
            console.error('Error deleting file:', unlinkErr);
        }

        console.error('Error deleting file:', err);
        await session.abortTransaction();
        session.endSession();
        throw new AppError(Constants.ERROR, err);
    } finally {
        console.log('@finally');
    }
}

/*
คำนวณรายได้ของแต่ละ node

Run every 13th (23:59)
7th (00:00) to 13th (23:59)
start: new Date(year, month, 7, 0, 0, 0)
end: new Date(year, month, 13, 23, 59, 59) 

Run every 20th (23:59)
14th (00:00) to 20th (23:59)
start: new Date(year, month, 14, 0, 0, 0)
end: new Date(year, month, 20, 23, 59, 59) 

Run every 27th (23:59)
21st (00:00) to 27th (23:59)
start: new Date(year, month, 21, 0, 0, 0)
end: new Date(year, month, 27, 23, 59, 59)

Run every 6th (23:59) 
28th (00:00) of current month to 6th (23:59) 
start: new Date(year, month-1, 28, 0, 0, 0)
end: new Date(year, month, 6, 23, 59, 59) 


const startDate = new Date('2024-09-20T00:00:00.000Z');
const endDate = new Date('2024-09-21T00:00:00.000Z');

const query = {
    'current.ownerId': '',
    'current.status': 2,
    updatedAt: {
        $gte: startDate,
        $lte: endDate
    }
};

const documents = await collection.find(query).toArray();
console.log(documents);
*/

// export const createPeriod = async()=>{
//     // throw new AppError(Constants.ERROR, "Error : createPeriod") 
//     const periods = generatePeriodsFromDates(2023, 1, 2034, 12);
//     console.log("periods : ", periods);

//     await Model.Period.deleteMany({});
//     // Save each period
//     for (const period of periods) {
//         const newPeriod = new Model.Period(period);
//         await newPeriod.save();
//     }

//     return periods;
// }

// Function to build the tree with level limitation
async function calculateTree(parentId = null, level = 1, startPeriod, endPeriod) {
    const nodes = await Model.Node.find({ 'current.parentNodeId': parentId });
    
    return await Promise.all(nodes.map(async (node) => {

        /*
        เช็ดว่า node นี้มีการจ่าเงินใน period นี้หรือเปล่า
        - ถ้าอยู่จะนําเอาไปคำนวณเงิน 
        */
        /*
        find range period for now()
        */
        // const currentPeriod = await Model.Period.findOne({
        //     start: { $lte: timePeriod }, // Start date should be less than or equal to now
        //     end: { $gte: timePeriod }    // End date should be greater than or equal to now
        // });

        /** ยอดเสมือนจ่ายจริงแต่ละ period 
         *  จะเช็ดเฉพาะ node ที่ถูกสร้างใน period นี้
         * **/
        // console.log("จะเช็ดเฉพาะ node ที่ถูกสร้างใน period นี้ : ", node.createdAt)
        // Check if createdAt is within the range
        if (node.createdAt >= startPeriod && node.createdAt <= endPeriod) {
            // console.log(`createdAt is within the specified period = ${ node }`);
            node = {...node._doc, inVisulPeriod: true}
        }else{
            node = {...node._doc, inVisulPeriod: false}
        }

        /** ยอดเสมือนจ่ายจริงแต่ละ period **/


        /** ยอดจ่ายจริงแต่ละ period **/
        /**
         หา order ที่อยู่ใน period  
        */
        const query = {
            'current.ownerId': node.current.ownerId,
            'current.status': 2,
            updatedAt: {
                $gte: startPeriod,
                $lte: endPeriod
            }
        };

        const order = await Model.Order.findOne(query);
        if(order !== null){
            node = {...node, inRealPeriod: true}
        }else{
            node = {...node, inRealPeriod: false}
        }
        /** ยอดจ่ายจริงแต่ละ period **/

        /*
        เช็ดว่า node นี้มีการจ่าเงินใน period นี้หรือเปล่า
        */

        // const level = await calculateNodeLevel(node._id);

        const nextLevel = level + 1;
        
        // Check if current level exceeds maxLevel
        if (nextLevel >= 6) {
            // Do not build children if the max level is reached
            return {
                title: `id: ${node._id.toString()}, parentNodeId: ${node.current.parentNodeId}, ownerId: ${node.current.ownerId}, number: ${node.current.number}, level: ${nextLevel}, isParent: ${node.current.isParent}`,
                key: node._id.toString(),
                node,
                owner: await Model.Member.findById(node.current.ownerId),
                level: nextLevel,
                children: null, // No children if max level is reached
            };
        } else {
            // Continue building the tree recursively if max level is not reached
            const children = await calculateTree(node._id, nextLevel, startPeriod, endPeriod);
            return {
                title: `id: ${node._id.toString()}, parentNodeId: ${node.current.parentNodeId}, ownerId: ${node.current.ownerId}, number: ${node.current.number}, level: ${nextLevel}, isParent: ${node.current.isParent}`,
                key: node._id.toString(),
                node,
                owner: await Model.Member.findById(node.current.ownerId),
                level: nextLevel,
                children: children.length ? children : null,
            };
        }
    }));
}

/*
const now = new Date(); // Get the current date and time
const currentPeriod = await Model.Period.findOne({
    start: { $lte: now }, // Start date should be less than or equal to now
    end: { $gte: now }    // End date should be greater than or equal to now
}); 
*/
export const calculateAmount = async(nodeId, currentPeriod) => {
    /*
    find range period for now()
    */
    // const currentPeriod = await Model.Period.findOne({
    //     start: { $lte: timePeriod }, // Start date should be less than or equal to now
    //     end: { $gte: timePeriod }    // End date should be greater than or equal to now
    // });

    // const currentPeriod = await Model.Period.findById(periodId)
    // if(!currentPeriod) throw new AppError(Constants.ERROR, "Period is empty!")

    const level = 1;

    let startPeriod = currentPeriod.start;
    let endPeriod = currentPeriod.end;

    const node = await Model.Node.findById(nodeId);
    if(node){
        const trees = await calculateTree(nodeId, level, startPeriod, endPeriod)
        const owner = await Model.Member.findById(node.current.ownerId)
        return [{
                    title: `id: ${node._id.toString()}, parentNodeId: ${node.current.parentNodeId} ,ownerId: ${node.current.ownerId}, number: ${node.current.number}, level: 1, isParent: ${node.current.isParent}`,
                    key: node._id.toString(),
                    node,
                    owner,
                    level,
                    children: trees
                }]
    }

    return []
}