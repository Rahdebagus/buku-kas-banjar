import auth from './auth.js';
export default function callback(req,res){
 req.query.action='callback';
 return auth(req,res);
}
