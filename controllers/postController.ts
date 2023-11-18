import fs from "fs";
import sharp from "sharp";
import multer from "multer";
import shortId from "shortid";
import appRoot from "app-root-path";
import { Blog } from "../models/Blog";
import { Request, Response } from "express";
import { truncate } from "../utils/helpers";
import { formatDate } from "../utils/jalali";
import { fileFilter } from "../utils/multer";
import { errorController } from "./errorController";
import { schemaPost } from "../models/secure/postValidation";

export class postController {
  public static async index(req: Request, res: Response) {
    try {
      // let auth;
      // req.isAuthenticated() ? (auth = true) : (auth = false);

      const page = +req.query.page! || 1;
      const postPerPage = 5;

      const numberOfPosts = await Blog.find({
        status: "public",
      }).countDocuments();

      const posts = await Blog.find({ status: "public" })
        .sort({
          createdAt: "desc",
        })
        .skip((page - 1) * postPerPage)
        .limit(postPerPage);

      res.render("index", {
        pageTitle: "weblog",
        message: req.flash("success_msg"),
        error: req.flash("error"),
        posts,
        formatDate,
        truncate,
        currentPage: page,
        nextPage: page + 1,
        previousPage: page - 1,
        hasNextPage: postPerPage * page < numberOfPosts,
        hasPreviousPage: page > 1,
        lastPage: Math.ceil(numberOfPosts / postPerPage),
        // auth,
      });
    } catch (error) {
      console.log(error);
      errorController[500]("", res);
    }
  }

  public static async show(req: Request, res: Response) {
    try {
      const post = await Blog.findOne({ _id: req.params.id }).populate("user");
      if (post) {
        res.render("posts/show", {
          pageTitle: post.title,
          post,
          formatDate,
        });
      } else {
        errorController[404]("", res);
      }
    } catch (error) {
      console.log(error);
      errorController[500]("", res);
    }
  }

  public static create(req: Request, res: Response) {
    try {
      res.render("posts/create", {
        pageTitle: "createPost",
        message: req.flash("success_msg"),
        error: req.flash("error"),
      });
    } catch (error) {
      console.log(error);
      errorController[500]("", res);
    }
  }

  public static store(
    req: {
      files: { thumbnail: any };
      body: any;
      user: { id: any };
      flash: (arg0: string, arg1: string) => void;
    },
    res: any
  ) {
    try {
      const thumbnail = req.files ? req.files.thumbnail : {};
      const fileName = `${shortId.generate()}_${thumbnail.name}`;
      const uploadPath = `${appRoot}/public/uploads/thumbnails/${fileName}`;
      req.body = { ...req.body, thumbnail };
      schemaPost
        .validate(req.body, { abortEarly: false })
        .then(async () => {
          await sharp(thumbnail.data)
            .jpeg({ quality: 60 })
            .toFile(uploadPath)
            .catch((err) => console.log(err));
          await Blog.create({
            ...req.body,
            user: req.user.id,
            thumbnail: fileName,
          });
          req.flash("success_msg", "post created!");
          res.redirect("/admin");
        })
        .catch((err: { errors: string }) => {
          req.flash("error", err.errors);
          res.redirect("/blog/create");
        });
    } catch (error) {
      console.log(error);
      errorController[500]("", res);
    }
  }

  public static upload(req: Request, res: Response) {
    try {
      const upload = multer({
        limits: { fileSize: 4000000 },
        fileFilter: fileFilter,
      }).single("image");

      upload(req, res, async (err) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res
              .status(400)
              .send("The size of the photo sent should not be more than 4 MB");
          }
          console.log(err);

          res.status(400).send(err);
        } else {
          if (req.file) {
            const fileName = `${shortId.generate()}_${req.file.originalname}`;
            await sharp(req.file.buffer)
              .jpeg({
                quality: 60,
              })
              .toFile(`./public/uploads/${fileName}`)
              .catch((err) => console.log(err));
            res.status(200).send(`http://localhost:3000/uploads/${fileName}`);
          } else {
            res.send("You must select a photo to upload");
          }
        }
      });
    } catch (error) {
      console.log(error);
      errorController[500]("", res);
    }
  }

  public static async edit(
    req: {
      params: { id: any };
      user: { _id: string };
      flash: (arg0: string) => any;
    },
    res: any
  ) {
    try {
      const post = await Blog.findOne({
        _id: req.params.id,
      });
      if (post) {
        if (post.user!.toString() == req.user._id) {
          res.render("posts/edit", {
            pageTitle: "editPost",
            message: req.flash("success_msg"),
            error: req.flash("error"),
            post,
          });
        } else {
          res.redirect("/admin");
        }
      } else {
        res.render("index");
      }
    } catch (error) {
      console.log(error);
      errorController[500]("", res);
    }
  }

  public static async update(
    req: {
      files: { thumbnail: any };
      params: { id: any };
      body: any;
      user: { _id: string };
      flash: (arg0: string, arg1: string) => void;
    },
    res: any
  ) {
    try {
      const thumbnail = req.files ? req.files.thumbnail : {};
      const fileName = `${shortId.generate()}_${thumbnail.name}`;
      const uploadPath = `${appRoot}/public/uploads/thumbnails/${fileName}`;
      const post = await Blog.findOne({ _id: req.params.id });
      if (thumbnail.name) {
        req.body = { ...req.body, thumbnail };
      } else {
        req.body = {
          ...req.body,
          thumbnail: {
            name: "placeholder",
            size: 0,
            mimetype: "image/jpeg",
          },
        };
      }
      schemaPost
        .validate(req.body, { abortEarly: false })
        .then(async () => {
          if (post) {
            if (post.user!.toString() == req.user._id) {
              if (thumbnail.name) {
                fs.unlink(
                  `${appRoot}/public/uploads/thumbnails/${post.thumbnail}`,
                  async (err: any) => {
                    if (err) console.log(err);
                    else {
                      await sharp(thumbnail.data)
                        .jpeg({ quality: 60 })
                        .toFile(uploadPath)
                        .catch((err) => console.log(err));
                    }
                  }
                );
              }

              const { title, status, body } = req.body;
              post.title = title;
              post.status = status;
              post.body = body;
              post.thumbnail = thumbnail.name ? fileName : post.thumbnail;

              await post.save();
              req.flash("success_msg", "post edited!");
              res.redirect("/admin");
            } else {
              res.redirect("/dashboard");
            }
          } else {
            res.redirect("/admin");
          }
        })
        .catch((err) => {
          req.flash("error", err.errors);
          res.redirect(`/blog/edit/${req.params.id}`);
        });
    } catch (error) {
      console.log(error);
      errorController[500]("", res);
    }
  }

  public static async delete(req: Request, res: Response) {
    try {
      const post = await Blog.findOne({
        _id: req.params.id,
      });
      if (post) {
        const result = await Blog.findByIdAndRemove(req.params.id);
        console.log(result);
        fs.unlink(
          `${appRoot}/public/uploads/thumbnails/${post.thumbnail}`,
          (err: any) => {
            if (err) console.log(err);
          }
        );
        req.flash("success_msg", "post deleted!");
        res.redirect("/admin");
      } else {
        res.redirect("/admin");
      }
    } catch (error) {
      console.log(error);
      errorController[500]("", res);
    }
  }
}
